package id.openhr.ess.data.remote

import id.openhr.ess.data.model.*
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface OpenHrApi {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @POST("api/auth/logout")
    suspend fun logout(@Body request: LogoutRequest): SimpleMessageResponse

    @GET("api/public/company")
    suspend fun getPublicCompany(): PublicCompanyResponse

    @GET("api/attendance/branch")
    suspend fun getAttendanceBranch(): BranchResponse

    @GET("api/settings/attendance")
    suspend fun getAttendanceSettings(): AttendanceSettingsResponse

    @GET("api/attendance/today")
    suspend fun getTodayAttendance(@Query("date") date: String): TodayAttendanceResponse

    @POST("api/attendance/clock")
    suspend fun clockAttendance(@Body request: ClockRequest): ClockResponse

    @GET("api/attendance/my")
    suspend fun getMyAttendance(@Query("month") month: String): MyAttendanceResponse

    @POST("api/attendance/correction")
    suspend fun requestAttendanceCorrection(@Body request: AttendanceCorrectionRequest): SimpleMessageResponse

    @GET("api/leave/types")
    suspend fun getLeaveTypes(): LeaveTypesResponse

    @GET("api/leave/balances")
    suspend fun getLeaveBalances(): LeaveBalancesResponse

    @GET("api/leave/requests")
    suspend fun getLeaveRequests(@Query("scope") scope: String = "mine"): LeaveRequestsResponse

    @POST("api/leave/requests")
    suspend fun createLeaveRequest(@Body request: CreateLeaveRequest): SimpleMessageResponse

    @GET("api/shifts/overtime/requests")
    suspend fun getOvertimeRequests(@Query("scope") scope: String = "mine"): OvertimeRequestsResponse

    @POST("api/shifts/overtime/requests")
    suspend fun createOvertimeRequest(@Body request: CreateOvertimeRequest): SimpleMessageResponse

    @GET("api/kasbon/reimbursements")
    suspend fun getReimbursements(
        @Query("month") month: String,
        @Query("scope") scope: String = "mine"
    ): ReimbursementsResponse

    @POST("api/kasbon/reimbursements")
    suspend fun createReimbursement(@Body request: CreateReimbursementRequest): SimpleMessageResponse

    @GET("api/kasbon/requests")
    suspend fun getKasbonRequests(): KasbonRequestsResponse

    @POST("api/kasbon/requests")
    suspend fun createKasbonRequest(@Body request: CreateKasbonRequest): SimpleMessageResponse

    @GET("api/payroll/my-payslips")
    suspend fun getMyPayslips(): MyPayslipsResponse

    @GET("api/payroll/items/{id}/payslip")
    suspend fun getPayslipDetail(@Path("id") itemId: String): PayslipDetailResponse

    @GET("api/employees/{id}")
    suspend fun getEmployee(@Path("id") employeeId: String): EmployeeResponse

    @PUT("api/employees/{id}/contact")
    suspend fun updateContact(
        @Path("id") employeeId: String,
        @Body request: UpdateContactRequest
    ): SimpleMessageResponse

    @PUT("api/employees/{id}/bank-details")
    suspend fun updateBankDetails(
        @Path("id") employeeId: String,
        @Body request: UpdateBankDetailsRequest
    ): SimpleMessageResponse

    @PUT("api/employees/{id}/photo")
    suspend fun updateEmployeePhoto(
        @Path("id") employeeId: String,
        @Body request: UpdateEmployeePhotoRequest
    ): UpdateEmployeePhotoResponse

    @retrofit2.http.DELETE("api/employees/{id}/photo")
    suspend fun deleteEmployeePhoto(
        @Path("id") employeeId: String
    ): SimpleMessageResponse

    // Announcements & Policy Acks
    @GET("api/announcements")
    suspend fun getAnnouncements(): AnnouncementsResponse

    @POST("api/announcements/{id}/ack")
    suspend fun acknowledgeAnnouncement(@Path("id") id: String): AnnouncementAckResponse

    // Shifts Roster
    @GET("api/shifts/roster")
    suspend fun getShiftRoster(
        @Query("start_date") startDate: String,
        @Query("end_date") endDate: String
    ): ShiftRosterResponse

    // Team Approvals & Review Actions
    @GET("api/leave/requests")
    suspend fun getTeamLeaveRequests(@Query("scope") scope: String = "team"): LeaveRequestsResponse

    @POST("api/leave/requests/{id}/review")
    suspend fun reviewLeaveRequest(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    @GET("api/shifts/overtime/requests")
    suspend fun getTeamOvertimeRequests(@Query("scope") scope: String = "team"): OvertimeRequestsResponse

    @POST("api/shifts/overtime/requests/{id}/review")
    suspend fun reviewOvertimeRequest(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    @GET("api/attendance/corrections")
    suspend fun getAttendanceCorrections(): CorrectionsResponse

    @POST("api/attendance/corrections/{id}/review")
    suspend fun reviewAttendanceCorrection(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    @GET("api/kasbon/reimbursements")
    suspend fun getTeamReimbursements(
        @Query("month") month: String,
        @Query("scope") scope: String = "team"
    ): ReimbursementsResponse

    @POST("api/kasbon/reimbursements/{id}/review")
    suspend fun reviewReimbursement(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    @POST("api/kasbon/requests/{id}/review")
    suspend fun reviewKasbonRequest(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    // Tasks (TMS)
    @GET("api/tasks/meta")
    suspend fun getTaskMeta(): TaskMetaResponse

    @GET("api/tasks")
    suspend fun getTasks(
        @Query("tab") tab: String = "inbox",
        @Query("priority") priority: String? = null,
        @Query("search") search: String? = null
    ): TasksResponse

    @POST("api/tasks")
    suspend fun createTask(@Body body: CreateTaskBody): CreateTaskResponse

    @GET("api/tasks/{id}")
    suspend fun getTaskDetail(@Path("id") id: String): TaskDetailResponse

    @POST("api/tasks/{id}/action")
    suspend fun takeTaskAction(
        @Path("id") id: String,
        @Body body: TaskActionBody
    ): SimpleMessageResponse

    @POST("api/tasks/{id}/handover")
    suspend fun handoverTask(
        @Path("id") id: String,
        @Body body: TaskHandoverBody
    ): SimpleMessageResponse

    @POST("api/tasks/{id}/reschedule")
    suspend fun rescheduleTask(
        @Path("id") id: String,
        @Body body: TaskRescheduleBody
    ): SimpleMessageResponse

    @POST("api/tasks/{id}/close")
    suspend fun closeTask(
        @Path("id") id: String,
        @Body body: TaskCloseBody
    ): SimpleMessageResponse

    @POST("api/tasks/{id}/approve")
    suspend fun approveTask(
        @Path("id") id: String,
        @Body body: TaskApproveBody
    ): SimpleMessageResponse

    // Petty Cash & Realization
    @GET("api/petty-cash/requests")
    suspend fun getPettyCashRequests(@Query("scope") scope: String = "mine"): PettyCashRequestsResponse

    @POST("api/petty-cash/requests")
    suspend fun createPettyCashRequest(@Body body: CreatePettyCashRequest): SimpleMessageResponse

    @GET("api/petty-cash/requests/{id}")
    suspend fun getPettyCashDetail(@Path("id") id: String): PettyCashDetailResponse

    @POST("api/petty-cash/requests/{id}/cancel")
    suspend fun cancelPettyCash(@Path("id") id: String): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/approve")
    suspend fun approvePettyCash(
        @Path("id") id: String,
        @Body body: ApprovePettyCashBody
    ): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/reject")
    suspend fun rejectPettyCash(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/expenses")
    suspend fun addPettyCashExpense(
        @Path("id") id: String,
        @Body body: AddPettyCashExpenseRequest
    ): SimpleMessageResponse

    @retrofit2.http.DELETE("api/petty-cash/requests/{id}/expenses/{expenseId}")
    suspend fun deletePettyCashExpense(
        @Path("id") id: String,
        @Path("expenseId") expenseId: String
    ): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/expenses/{expenseId}/receipts")
    suspend fun uploadPettyCashReceipt(
        @Path("id") id: String,
        @Path("expenseId") expenseId: String,
        @Body body: UploadPettyCashReceiptRequest
    ): SimpleMessageResponse

    @retrofit2.http.DELETE("api/petty-cash/requests/{id}/expenses/{expenseId}/receipts/{receiptId}")
    suspend fun deletePettyCashReceipt(
        @Path("id") id: String,
        @Path("expenseId") expenseId: String,
        @Path("receiptId") receiptId: String
    ): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/submit-report")
    suspend fun submitPettyCashReport(@Path("id") id: String): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/report-approve")
    suspend fun approvePettyCashReport(@Path("id") id: String): SimpleMessageResponse

    @POST("api/petty-cash/requests/{id}/report-reject")
    suspend fun rejectPettyCashReport(
        @Path("id") id: String,
        @Body body: ReviewRequestBody
    ): SimpleMessageResponse

    // My Assets & Signing Requests
    @GET("api/assets/mine")
    suspend fun getMyAssets(): MyAssetsResponse

    @GET("api/hr/signing-requests")
    suspend fun getSigningRequests(): SigningRequestsResponse
}
