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
}
