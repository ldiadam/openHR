package id.openhr.ess.data.repository

import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.model.*
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.remote.ApiException

data class SyncResult(
    val synced: Int,
    val failed: Int,
    val geofenceBlockedItems: List<OfflineClockRecord> = emptyList()
)

class EssRepository(
    private val apiClient: ApiClient,
    private val sessionStore: SessionStore
) {
    private val api get() = apiClient.api

    private suspend fun <T> safeCall(block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (t: Throwable) {
            Result.failure(apiClient.parseError(t))
        }
    }

    suspend fun login(email: String, password: String): Result<UserSession> = safeCall {
        val response = api.login(LoginRequest(email.trim(), password))
        sessionStore.saveSession(response.token, response.user)
        response.user
    }

    suspend fun getPublicCompany(): Result<PublicCompany?> = safeCall {
        api.getPublicCompany().company
    }

    suspend fun getAttendanceBranch(): Result<BranchInfo?> = safeCall {
        api.getAttendanceBranch().branch
    }

    suspend fun getAttendanceSettings(): Result<AttendanceSettingsResponse> = safeCall {
        api.getAttendanceSettings()
    }

    suspend fun getTodayAttendance(date: String): Result<List<TodayAttendanceRecord>> = safeCall {
        api.getTodayAttendance(date).records
    }

    suspend fun clockAttendance(request: ClockRequest): Result<ClockResponse> = safeCall {
        api.clockAttendance(request)
    }

    suspend fun syncOfflineQueue(geofenceReasonsById: Map<String, String> = emptyMap()): SyncResult {
        val queue = sessionStore.offlineQueueFlow.value
        if (queue.isEmpty()) return SyncResult(0, 0)

        val nonRetryable = setOf("ALREADY_CLOCKED_IN", "ALREADY_CLOCKED_OUT", "NOT_CLOCKED_IN")
        val remaining = mutableListOf<OfflineClockRecord>()
        val geofenceNeeded = mutableListOf<OfflineClockRecord>()
        var synced = 0
        var failed = 0

        for (item in queue) {
            val reason = geofenceReasonsById[item.id] ?: item.geofence_reason
            val req = ClockRequest(
                type = item.type,
                latitude = item.latitude,
                longitude = item.longitude,
                photo_base64 = item.photo_base64,
                geofence_reason = reason,
                device_timestamp = item.device_timestamp,
                local_date = item.local_date,
                local_time = item.local_time,
                is_offline_sync = 1
            )

            try {
                api.clockAttendance(req)
                synced++
            } catch (t: Throwable) {
                val err = apiClient.parseError(t)
                when {
                    err.errorCode in nonRetryable -> {
                        failed++
                    }
                    err.errorCode == "OUT_OF_GEOFENCE" && reason.isNullOrBlank() -> {
                        failed++
                        geofenceNeeded += item
                        remaining += item
                    }
                    else -> {
                        failed++
                        remaining += item.copy(geofence_reason = reason)
                    }
                }
            }
        }

        sessionStore.replaceOfflineQueue(remaining)
        return SyncResult(synced = synced, failed = failed, geofenceBlockedItems = geofenceNeeded)
    }

    suspend fun getMyAttendance(month: String): Result<MyAttendanceResponse> = safeCall {
        api.getMyAttendance(month)
    }

    suspend fun requestAttendanceCorrection(req: AttendanceCorrectionRequest): Result<String> = safeCall {
        api.requestAttendanceCorrection(req).message
    }

    suspend fun getLeaveTypes(): Result<List<LeaveTypeItem>> = safeCall {
        api.getLeaveTypes().leaveTypes
    }

    suspend fun getLeaveBalances(): Result<List<LeaveBalanceItem>> = safeCall {
        api.getLeaveBalances().balances
    }

    suspend fun getLeaveRequests(): Result<List<LeaveRequestItem>> = safeCall {
        api.getLeaveRequests("mine").requests
    }

    suspend fun createLeaveRequest(req: CreateLeaveRequest): Result<String> = safeCall {
        api.createLeaveRequest(req).message
    }

    suspend fun getOvertimeRequests(): Result<List<OvertimeRequestItem>> = safeCall {
        api.getOvertimeRequests("mine").requests
    }

    suspend fun createOvertimeRequest(req: CreateOvertimeRequest): Result<String> = safeCall {
        api.createOvertimeRequest(req).message
    }

    suspend fun getReimbursements(month: String): Result<List<ReimbursementItem>> = safeCall {
        api.getReimbursements(month, "mine").reimbursements
    }

    suspend fun createReimbursement(req: CreateReimbursementRequest): Result<String> = safeCall {
        api.createReimbursement(req).message
    }

    suspend fun getKasbonRequests(): Result<List<KasbonItem>> = safeCall {
        api.getKasbonRequests().kasbonList
    }

    suspend fun createKasbonRequest(req: CreateKasbonRequest): Result<String> = safeCall {
        api.createKasbonRequest(req).message
    }

    suspend fun getMyPayslips(): Result<List<PayslipSummaryItem>> = safeCall {
        api.getMyPayslips().payslips
    }

    suspend fun getPayslipDetail(itemId: String): Result<PayslipDetail> = safeCall {
        api.getPayslipDetail(itemId).payslip
    }

    suspend fun getEmployee(employeeId: String): Result<EmployeeProfile?> = safeCall {
        api.getEmployee(employeeId).employee
    }

    suspend fun updateContact(employeeId: String, phone: String, address: String): Result<String> = safeCall {
        api.updateContact(employeeId, UpdateContactRequest(phone, address)).message
    }

    suspend fun updateBankDetails(employeeId: String, req: UpdateBankDetailsRequest): Result<String> = safeCall {
        api.updateBankDetails(employeeId, req).message
    }
}
