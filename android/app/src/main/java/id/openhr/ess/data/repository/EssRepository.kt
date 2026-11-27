package id.openhr.ess.data.repository

import android.os.Build
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
    private val attendanceCache = mutableMapOf<String, MyAttendanceResponse>()
    var cachedPayslips: List<PayslipSummaryItem>? = null
        private set
    var cachedProfile: EmployeeProfile? = null
        private set
    var cachedLeaveBalances: List<LeaveBalanceItem>? = null
        private set
    var cachedLeaveRequests: List<LeaveRequestItem>? = null
        private set
    var cachedOvertimeRequests: List<OvertimeRequestItem>? = null
        private set
    var cachedKasbonRequests: List<KasbonItem>? = null
        private set
    private val reimbursementCache = mutableMapOf<String, List<ReimbursementItem>>()

    fun getCachedMyAttendance(month: String): MyAttendanceResponse? = attendanceCache[month]
    fun getCachedReimbursements(month: String): List<ReimbursementItem>? = reimbursementCache[month]

    private suspend fun <T> safeCall(block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (t: Throwable) {
            Result.failure(apiClient.parseError(t))
        }
    }

    suspend fun login(email: String, password: String): Result<UserSession> = safeCall {
        val deviceLabel = "${Build.MANUFACTURER} ${Build.MODEL}".take(100)
        val response = api.login(
            LoginRequest(
                email = email.trim(),
                password = password,
                client = "mobile",
                deviceLabel = deviceLabel
            )
        )
        sessionStore.saveSession(response.token, response.user, response.refreshToken)
        response.user
    }

    suspend fun logout() {
        val refreshToken = sessionStore.getRefreshToken()
        sessionStore.clearSession()
        if (!refreshToken.isNullOrBlank()) {
            runCatching { api.logout(LogoutRequest(refreshToken)) }
        }
    }

    suspend fun getPublicCompany(): Result<PublicCompany?> = safeCall {
        api.getPublicCompany().company?.also { comp ->
            sessionStore.saveCompanyBranding(comp.name, comp.logo_url)
            comp.modules?.let { sessionStore.saveModules(it) }
        }
    }

    suspend fun getAttendanceBranch(): Result<BranchInfo?> = safeCall {
        api.getAttendanceBranch().branch?.also { sessionStore.saveCachedBranch(it) }
    }

    suspend fun getAttendanceSettings(): Result<AttendanceSettingsResponse> = safeCall {
        api.getAttendanceSettings().also { sessionStore.saveCachedSettings(it) }
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
        api.getMyAttendance(month).also { attendanceCache[month] = it }
    }

    suspend fun requestAttendanceCorrection(req: AttendanceCorrectionRequest): Result<String> = safeCall {
        api.requestAttendanceCorrection(req).message
    }

    suspend fun getLeaveTypes(): Result<List<LeaveTypeItem>> = safeCall {
        api.getLeaveTypes().leaveTypes
    }

    suspend fun getLeaveBalances(): Result<List<LeaveBalanceItem>> = safeCall {
        api.getLeaveBalances().balances.also { cachedLeaveBalances = it }
    }

    suspend fun getLeaveRequests(): Result<List<LeaveRequestItem>> = safeCall {
        api.getLeaveRequests("mine").requests.also { cachedLeaveRequests = it }
    }

    suspend fun createLeaveRequest(req: CreateLeaveRequest): Result<String> = safeCall {
        api.createLeaveRequest(req).message
    }

    suspend fun getOvertimeRequests(): Result<List<OvertimeRequestItem>> = safeCall {
        api.getOvertimeRequests("mine").requests.also { cachedOvertimeRequests = it }
    }

    suspend fun createOvertimeRequest(req: CreateOvertimeRequest): Result<String> = safeCall {
        api.createOvertimeRequest(req).message
    }

    suspend fun getReimbursements(month: String): Result<List<ReimbursementItem>> = safeCall {
        api.getReimbursements(month, "mine").reimbursements.also { reimbursementCache[month] = it }
    }

    suspend fun createReimbursement(req: CreateReimbursementRequest): Result<String> = safeCall {
        api.createReimbursement(req).message
    }

    suspend fun getKasbonRequests(): Result<List<KasbonItem>> = safeCall {
        api.getKasbonRequests().kasbonList.also { cachedKasbonRequests = it }
    }

    suspend fun createKasbonRequest(req: CreateKasbonRequest): Result<String> = safeCall {
        api.createKasbonRequest(req).message
    }

    suspend fun getMyPayslips(): Result<List<PayslipSummaryItem>> = safeCall {
        api.getMyPayslips().payslips.also { cachedPayslips = it }
    }

    suspend fun getPayslipDetail(itemId: String): Result<PayslipDetail> = safeCall {
        api.getPayslipDetail(itemId).payslip
    }

    suspend fun getEmployee(employeeId: String): Result<EmployeeProfile?> = safeCall {
        api.getEmployee(employeeId).employee?.also { cachedProfile = it }
    }

    suspend fun updateContact(employeeId: String, phone: String, address: String): Result<String> = safeCall {
        api.updateContact(employeeId, UpdateContactRequest(phone, address)).message
    }

    suspend fun updateBankDetails(employeeId: String, req: UpdateBankDetailsRequest): Result<String> = safeCall {
        api.updateBankDetails(employeeId, req).message
    }

    // Announcements
    var cachedAnnouncements: List<AnnouncementItem>? = null
        private set

    suspend fun getAnnouncements(): Result<List<AnnouncementItem>> = safeCall {
        api.getAnnouncements().announcements.also { cachedAnnouncements = it }
    }

    suspend fun acknowledgeAnnouncement(id: String): Result<Boolean> = safeCall {
        api.acknowledgeAnnouncement(id).acknowledged
    }

    // Shifts Roster
    suspend fun getShiftRoster(startDate: String, endDate: String): Result<List<RosterItem>> = safeCall {
        api.getShiftRoster(startDate, endDate).roster
    }

    // Manager / Admin / Finance Approvals
    suspend fun getTeamLeaveRequests(): Result<List<LeaveRequestItem>> = safeCall {
        api.getTeamLeaveRequests("team").requests
    }

    suspend fun reviewLeaveRequest(id: String, status: String, note: String? = null): Result<String> = safeCall {
        api.reviewLeaveRequest(id, ReviewRequestBody(status, note)).message
    }

    suspend fun getTeamOvertimeRequests(): Result<List<OvertimeRequestItem>> = safeCall {
        api.getTeamOvertimeRequests("team").requests
    }

    suspend fun reviewOvertimeRequest(id: String, status: String, note: String? = null): Result<String> = safeCall {
        api.reviewOvertimeRequest(id, ReviewRequestBody(status, note)).message
    }

    suspend fun getTeamAttendanceCorrections(): Result<List<AttendanceCorrectionItem>> = safeCall {
        api.getAttendanceCorrections().corrections
    }

    suspend fun reviewAttendanceCorrection(id: String, status: String, note: String? = null): Result<String> = safeCall {
        api.reviewAttendanceCorrection(id, ReviewRequestBody(status, note)).message
    }

    suspend fun getTeamReimbursements(month: String): Result<List<ReimbursementItem>> = safeCall {
        api.getTeamReimbursements(month, "team").reimbursements
    }

    suspend fun reviewReimbursement(id: String, status: String, note: String? = null): Result<String> = safeCall {
        api.reviewReimbursement(id, ReviewRequestBody(status, note)).message
    }

    suspend fun reviewKasbonRequest(id: String, status: String, note: String? = null): Result<String> = safeCall {
        api.reviewKasbonRequest(id, ReviewRequestBody(status, note)).message
    }

    // Tasks (TMS)
    suspend fun getTasks(tab: String = "inbox"): Result<TasksResponse> = safeCall {
        api.getTasks(tab)
    }

    suspend fun takeTaskAction(id: String, status: String, note: String): Result<String> = safeCall {
        api.takeTaskAction(id, TaskActionBody(status, note)).message
    }

    suspend fun closeTask(id: String, remarks: String): Result<String> = safeCall {
        api.closeTask(id, TaskCloseBody(remarks)).message
    }

    suspend fun approveTask(id: String, decision: String, remarks: String? = null): Result<String> = safeCall {
        api.approveTask(id, TaskApproveBody(decision, remarks)).message
    }

    // Petty Cash & Realization
    suspend fun getMyPettyCash(): Result<List<PettyCashRequestItem>> = safeCall {
        api.getPettyCashRequests("mine").requests
    }

    suspend fun getTeamPettyCash(): Result<List<PettyCashRequestItem>> = safeCall {
        api.getPettyCashRequests("team").requests
    }

    suspend fun createPettyCash(purpose: String, amount: Double): Result<String> = safeCall {
        api.createPettyCashRequest(CreatePettyCashRequest(purpose, amount)).message
    }

    suspend fun getPettyCashDetail(id: String): Result<PettyCashDetailResponse> = safeCall {
        api.getPettyCashDetail(id)
    }

    suspend fun cancelPettyCash(id: String): Result<String> = safeCall {
        api.cancelPettyCash(id).message
    }

    suspend fun approvePettyCash(id: String, disbursedAmount: Double? = null): Result<String> = safeCall {
        api.approvePettyCash(id, ApprovePettyCashBody(disbursedAmount)).message
    }

    suspend fun rejectPettyCash(id: String, note: String): Result<String> = safeCall {
        api.rejectPettyCash(id, ReviewRequestBody("rejected", note)).message
    }

    suspend fun addPettyCashExpense(id: String, req: AddPettyCashExpenseRequest): Result<String> = safeCall {
        api.addPettyCashExpense(id, req).message
    }

    suspend fun deletePettyCashExpense(id: String, expenseId: String): Result<String> = safeCall {
        api.deletePettyCashExpense(id, expenseId).message
    }

    suspend fun uploadPettyCashReceipt(
        id: String,
        expenseId: String,
        req: UploadPettyCashReceiptRequest
    ): Result<String> = safeCall {
        api.uploadPettyCashReceipt(id, expenseId, req).message
    }

    suspend fun deletePettyCashReceipt(id: String, expenseId: String, receiptId: String): Result<String> = safeCall {
        api.deletePettyCashReceipt(id, expenseId, receiptId).message
    }

    suspend fun submitPettyCashReport(id: String): Result<String> = safeCall {
        api.submitPettyCashReport(id).message
    }

    suspend fun approvePettyCashReport(id: String): Result<String> = safeCall {
        api.approvePettyCashReport(id).message
    }

    suspend fun rejectPettyCashReport(id: String, note: String): Result<String> = safeCall {
        api.rejectPettyCashReport(id, ReviewRequestBody("report_rejected", note)).message
    }

    // My Assets & Signing Documents
    suspend fun getMyAssets(): Result<List<AssignedAssetItem>> = safeCall {
        api.getMyAssets().assets
    }

    suspend fun getMySigningRequests(): Result<List<SigningRequestItem>> = safeCall {
        api.getSigningRequests().signingRequests
    }
}
