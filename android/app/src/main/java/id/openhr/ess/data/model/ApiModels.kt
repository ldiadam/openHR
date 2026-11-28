package id.openhr.ess.data.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

/**
 * SQLite/D1 returns booleans as 0/1 integers in some endpoints and true/false in others.
 */
object FlexibleBooleanSerializer : KSerializer<Boolean> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleBoolean", PrimitiveKind.BOOLEAN)

    override fun serialize(encoder: Encoder, value: Boolean) {
        encoder.encodeBoolean(value)
    }

    override fun deserialize(decoder: Decoder): Boolean {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeBoolean()
        val element = jsonDecoder.decodeJsonElement()
        val primitive = element as? JsonPrimitive ?: return false
        primitive.booleanOrNull?.let { return it }
        primitive.intOrNull?.let { return it != 0 }
        return primitive.content.equals("true", ignoreCase = true) || primitive.content == "1"
    }
}

@Serializable
data class ApiErrorBody(
    val error: String? = null,
    val message: String? = null,
    val code: String? = null,
    val distanceMeters: Double? = null
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val client: String = "mobile",
    val deviceLabel: String? = null
)

@Serializable
data class LoginResponse(
    val token: String,
    val refreshToken: String? = null,
    val user: UserSession
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
    val deviceLabel: String? = null
)

@Serializable
data class LogoutRequest(
    val refreshToken: String? = null
)

@Serializable
data class LevelCapabilitiesDto(
    @Serializable(with = FlexibleBooleanSerializer::class) val can_approve_leave: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val can_approve_overtime: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val can_approve_claims: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val can_approve_petty_cash: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val can_approve_kasbon: Boolean = false,
    val approval_scope: String = "direct_reports",
    val can_assign_tasks_to: String = "none",
    @Serializable(with = FlexibleBooleanSerializer::class) val can_view_all_tasks: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val can_force_close_tasks: Boolean = false
)

@Serializable
data class LevelBypassDto(
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_approval_chain: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_leave_admin_check: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_leave_dept_head: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_leave_management: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_task_approval: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_geofence: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_claim_cutoff: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val bypass_petty_cash_limit: Boolean = false
)

@Serializable
data class EmployeeLevelDto(
    val id: String,
    val code: String,
    val name: String,
    val rank: Int = 10,
    val color: String = "#2563EB",
    val capabilities: LevelCapabilitiesDto = LevelCapabilitiesDto(),
    val bypass: LevelBypassDto = LevelBypassDto()
)

@Serializable
data class UserSession(
    val id: String,
    val email: String,
    val role: String,
    val employeeId: String? = null,
    val name: String = "",
    val jobTitle: String? = null,
    val departmentId: String? = null,
    val branchId: String? = null,
    val level: EmployeeLevelDto? = null
) {
    fun canApproveAny(): Boolean = level?.capabilities?.let {
        it.can_approve_leave || it.can_approve_overtime || it.can_approve_claims || it.can_approve_petty_cash || it.can_approve_kasbon
    } == true

    fun hasGeofenceBypass(): Boolean = level?.bypass?.bypass_geofence == true

    fun hasTaskApprovalBypass(): Boolean =
        level?.bypass?.bypass_task_approval == true || level?.capabilities?.can_force_close_tasks == true
}

@Serializable
data class PublicCompanyResponse(
    val company: PublicCompany? = null
)

@Serializable
data class SecurityPolicyDto(
    val anti_fake_gps_mode: String = "block",
    @Serializable(with = FlexibleBooleanSerializer::class) val block_rooted_devices: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val enforce_device_binding: Boolean = false
)

@Serializable
data class ClientSecurityPayload(
    @Serializable(with = FlexibleBooleanSerializer::class) val is_mock_location: Boolean = false,
    val spoof_apps: List<String> = emptyList(),
    @Serializable(with = FlexibleBooleanSerializer::class) val is_rooted: Boolean = false,
    val device_id: String? = null,
    val device_label: String? = null
)

@Serializable
data class PublicCompany(
    val name: String? = null,
    val legal_name: String? = null,
    val logo_url: String? = null,
    val primary_color: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val modules: ModulesConfig? = null,
    val securityPolicy: SecurityPolicyDto? = null
)

@Serializable
data class ModulesConfig(
    @Serializable(with = FlexibleBooleanSerializer::class) val attendance: Boolean = true,
    @Serializable(with = FlexibleBooleanSerializer::class) val leave: Boolean = true,
    @Serializable(with = FlexibleBooleanSerializer::class) val shifts: Boolean = true,
    @Serializable(with = FlexibleBooleanSerializer::class) val payroll: Boolean = true,
    @Serializable(with = FlexibleBooleanSerializer::class) val claims: Boolean = true,
    @Serializable(with = FlexibleBooleanSerializer::class) val petty_cash: Boolean = true,
    @Serializable(with = FlexibleBooleanSerializer::class) val announcements: Boolean = true
)

@Serializable
data class BranchResponse(
    val branch: BranchInfo? = null
)

@Serializable
data class BranchInfo(
    val id: String,
    val name: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val radius_meters: Int? = 150
)

@Serializable
data class AttendanceSettingsResponse(
    @Serializable(with = FlexibleBooleanSerializer::class) val require_selfie: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val require_location: Boolean = true
)

@Serializable
data class TodayAttendanceResponse(
    val date: String? = null,
    val records: List<TodayAttendanceRecord> = emptyList()
)

@Serializable
data class TodayAttendanceRecord(
    val employee_id: String,
    val nik: String? = null,
    val full_name: String? = null,
    val job_title: String? = null,
    val shift_name: String? = null,
    val shift_start_time: String? = null,
    val shift_end_time: String? = null,
    val attendance_id: String? = null,
    val clock_in_time: String? = null,
    val clock_out_time: String? = null,
    val status: String? = null,
    val late_minutes: Int = 0,
    val early_minutes: Int = 0,
    val clock_in_status: String? = null,
    val is_offline_sync: Int = 0,
    val clock_in_photo_key: String? = null,
    val clock_out_photo_key: String? = null
)

@Serializable
data class ClockRequest(
    val type: String, // "in" or "out"
    val latitude: Double,
    val longitude: Double,
    val photo_base64: String? = null,
    val geofence_reason: String? = null,
    val device_timestamp: String,
    val local_date: String,
    val local_time: String,
    val is_offline_sync: Int? = null,
    val security: ClientSecurityPayload? = null
)

@Serializable
data class ClockResponse(
    val message: String = "",
    val status: String? = null,
    val lateMinutes: Int = 0,
    val earlyMinutes: Int = 0,
    val actualWorkMinutes: Int = 0,
    val distanceMeters: Double? = null,
    val geofenceStatus: String? = null
)

@Serializable
data class OfflineClockRecord(
    val id: String,
    val type: String,
    val latitude: Double,
    val longitude: Double,
    val photo_base64: String? = null,
    val geofence_reason: String? = null,
    val device_timestamp: String,
    val local_date: String,
    val local_time: String,
    val security: ClientSecurityPayload? = null
)

@Serializable
data class MyAttendanceResponse(
    val month: String? = null,
    val summary: AttendanceSummary = AttendanceSummary(),
    val records: List<AttendanceHistoryRecord> = emptyList()
)

@Serializable
data class AttendanceSummary(
    val present: Int = 0,
    val late: Int = 0,
    val totalLateMinutes: Int = 0,
    val totalWorkMinutes: Int = 0
)

@Serializable
data class AttendanceHistoryRecord(
    val id: String,
    val employee_id: String? = null,
    val date: String,
    val clock_in_time: String? = null,
    val clock_out_time: String? = null,
    val status: String = "present",
    val late_minutes: Int = 0,
    val early_minutes: Int = 0,
    val actual_work_minutes: Int = 0,
    val is_offline_sync: Int = 0,
    val clock_in_photo_key: String? = null,
    val clock_out_photo_key: String? = null,
    val source: String? = null
)

@Serializable
data class AttendanceCorrectionRequest(
    val date: String,
    val requested_clock_in: String?,
    val requested_clock_out: String?,
    val reason: String
)

@Serializable
data class SimpleMessageResponse(
    val message: String = ""
)

@Serializable
data class LeaveTypesResponse(
    val leaveTypes: List<LeaveTypeItem> = emptyList()
)

@Serializable
data class LeaveTypeItem(
    val id: String,
    val code: String? = null,
    val name: String,
    val name_id: String? = null,
    val name_en: String? = null,
    val description: String? = null,
    val default_days: Double = 0.0,
    @Serializable(with = FlexibleBooleanSerializer::class) val requires_attachment: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val is_paid: Boolean = true
) {
    fun localizedName(lang: String): String =
        if (lang == "en") (name_en ?: name).ifBlank { name_id ?: code ?: name }
        else (name_id ?: name).ifBlank { name_en ?: code ?: name }
}

@Serializable
data class LeaveBalancesResponse(
    val balances: List<LeaveBalanceItem> = emptyList()
)

@Serializable
data class LeaveBalanceItem(
    val id: String,
    val employee_id: String? = null,
    val leave_type_id: String,
    val leave_type_name: String? = null,
    val leave_type_name_id: String? = null,
    val leave_type_name_en: String? = null,
    val leave_type_code: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val is_paid: Boolean = true,
    val year: Int = 2026,
    val total_entitled: Double = 0.0,
    val used_days: Double = 0.0,
    val remaining_days: Double = 0.0
)

@Serializable
data class LeaveRequestsResponse(
    val requests: List<LeaveRequestItem> = emptyList()
)

@Serializable
data class LeaveRequestItem(
    val id: String,
    val employee_id: String? = null,
    val full_name: String? = null,
    val nik: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val leave_type_id: String? = null,
    val leave_type_name: String? = null,
    val leave_type_name_id: String? = null,
    val leave_type_name_en: String? = null,
    val leave_type_code: String? = null,
    val start_date: String,
    val end_date: String,
    val total_days: Double = 0.0,
    val reason: String? = null,
    val attachment_key: String? = null,
    val status: String = "pending",
    val rejection_note: String? = null,
    val created_at: String? = null
)

@Serializable
data class CreateLeaveRequest(
    val leave_type_id: String,
    val start_date: String,
    val end_date: String,
    val total_days: Double,
    val reason: String,
    val attachment_base64: String? = null,
    val attachment_mime: String? = null
)

@Serializable
data class OvertimeRequestsResponse(
    val requests: List<OvertimeRequestItem> = emptyList()
)

@Serializable
data class OvertimeRequestItem(
    val id: String,
    val employee_id: String? = null,
    val full_name: String? = null,
    val nik: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val date: String,
    val start_time: String? = null,
    val end_time: String? = null,
    val planned_hours: Double = 0.0,
    val actual_hours: Double? = null,
    val reason: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val is_holiday_or_rest_day: Boolean = false,
    val status: String = "pending",
    val reviewer_note: String? = null,
    val created_at: String? = null
)

@Serializable
data class CreateOvertimeRequest(
    val date: String,
    val start_time: String,
    val end_time: String,
    val planned_hours: Double,
    val reason: String,
    val is_holiday_or_rest_day: Boolean
)

@Serializable
data class ReimbursementsResponse(
    val reimbursements: List<ReimbursementItem> = emptyList()
)

@Serializable
data class ReimbursementItem(
    val id: String,
    val employee_id: String? = null,
    val full_name: String? = null,
    val nik: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val category: String = "OTHERS",
    val amount: Double = 0.0,
    val description: String? = null,
    val expense_date: String? = null,
    val cost_centre: String? = null,
    val project_ref: String? = null,
    val remarks: String? = null,
    val status: String = "pending",
    val rejection_note: String? = null,
    val payroll_run_id: String? = null,
    val payroll_run_title: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val has_receipt: Boolean = false,
    val receipt_url: String? = null,
    val created_at: String? = null
)

@Serializable
data class CreateReimbursementRequest(
    val expense_date: String,
    val category: String,
    val amount: Double,
    val description: String,
    val remarks: String? = null,
    val cost_centre: String? = null,
    val project_ref: String? = null,
    val receipt_photo_base64: String? = null
)

@Serializable
data class KasbonRequestsResponse(
    val kasbonList: List<KasbonItem> = emptyList()
)

@Serializable
data class KasbonItem(
    val id: String,
    val employee_id: String? = null,
    val full_name: String? = null,
    val nik: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val amount: Double = 0.0,
    val reason: String? = null,
    val total_instalments: Int = 1,
    val remaining_amount: Double = 0.0,
    val instalment_amount: Double = 0.0,
    val status: String = "pending",
    val rejection_note: String? = null,
    val created_at: String? = null
)

@Serializable
data class CreateKasbonRequest(
    val amount: Double,
    val reason: String,
    val total_instalments: Int
)

@Serializable
data class MyPayslipsResponse(
    val payslips: List<PayslipSummaryItem> = emptyList()
)

@Serializable
data class PayslipSummaryItem(
    val id: String,
    val payroll_run_id: String,
    val take_home_pay: Double = 0.0,
    val gross_earnings: Double = 0.0,
    val total_deductions: Double = 0.0,
    val period_title: String = "",
    val period_start: String = "",
    val period_end: String = "",
    val payment_date: String? = null,
    val run_status: String? = null
)

@Serializable
data class PayslipDetailResponse(
    val payslip: PayslipDetail
)

@Serializable
data class PayslipDetail(
    val id: String,
    val payroll_run_id: String = "",
    val employee_id: String = "",
    val employee_nik: String? = null,
    val employee_name: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val ptkp_status: String? = null,
    val bank_name: String? = null,
    val bank_account_number: String? = null,
    val base_salary: Double = 0.0,
    val fixed_allowance: Double = 0.0,
    val prorated_salary: Double = 0.0,
    val days_worked: Double = 0.0,
    val expected_working_days: Double = 0.0,
    val overtime_hours: Double = 0.0,
    val overtime_pay: Double = 0.0,
    val attendance_bonus: Double = 0.0,
    val commission_bonus: Double = 0.0,
    val reimbursement_amount: Double = 0.0,
    val thr_amount: Double = 0.0,
    val gross_earnings: Double = 0.0,
    val late_deduction: Double = 0.0,
    val unpaid_leave_deduction: Double = 0.0,
    val kasbon_deduction: Double = 0.0,
    val other_deductions: Double = 0.0,
    val other_deductions_reason: String? = null,
    val alpha_days: Double = 0.0,
    val alpha_deduction: Double = 0.0,
    val bpjs_kes_employee: Double = 0.0,
    val bpjs_jht_employee: Double = 0.0,
    val bpjs_jp_employee: Double = 0.0,
    val pph21_amount: Double = 0.0,
    val pph21_method: String? = null,
    val total_deductions: Double = 0.0,
    val take_home_pay: Double = 0.0,
    val bpjs_kes_employer: Double = 0.0,
    val bpjs_jht_employer: Double = 0.0,
    val bpjs_jp_employer: Double = 0.0,
    val bpjs_jkk_employer: Double = 0.0,
    val bpjs_jkm_employer: Double = 0.0,
    val jkk_employer: Double = 0.0,
    val jkm_employer: Double = 0.0,
    val total_employer_cost: Double = 0.0,
    val run_title: String? = null,
    val period_start: String? = null,
    val period_end: String? = null,
    val payment_date: String? = null,
    val company_name: String? = null,
    val company_address: String? = null,
    val company_npwp: String? = null,
    val company_logo_url: String? = null,
    val approver_name: String? = null,
    val approver_title: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val authorized_by_company: Boolean = false,
    val alpha_dates: List<String> = emptyList(),
    val alpha_daily_rate: Double = 0.0,
    val alpha_daily_rate_exact: Double = 0.0
)

@Serializable
data class EmployeeResponse(
    val employee: EmployeeProfile? = null
)

@Serializable
data class CardLinkItem(
    val type: String = "custom",
    val label: String = "",
    val value: String = ""
)

@Serializable
data class UpdateCardLinksRequest(
    val card_bio: String? = null,
    val card_links: List<CardLinkItem> = emptyList()
)

@Serializable
data class UpdateCardLinksResponse(
    val message: String = "",
    val card_bio: String? = null,
    val card_links: List<CardLinkItem> = emptyList()
)

@Serializable
data class EmployeeProfile(
    val id: String,
    val nik: String? = null,
    val full_name: String? = null,
    val ktp_number: String? = null,
    val passport_number: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val is_foreign_worker: Boolean = false,
    val npwp_number: String? = null,
    val ptkp_status: String? = null,
    val join_date: String? = null,
    val job_title: String? = null,
    val level_code: String? = null,
    val level_name: String? = null,
    val level_rank: Int? = null,
    val level_color: String? = null,
    val employment_status: String? = null,
    val lifecycle_status: String? = null,
    val phone: String? = null,
    val address: String? = null,
    val company_email: String? = null,
    val personal_email: String? = null,
    val bank_name: String? = null,
    val bank_swift_code: String? = null,
    val bank_branch_name: String? = null,
    val bank_branch_code: String? = null,
    val bank_branch_address: String? = null,
    val bank_account_number: String? = null,
    val bank_account_holder: String? = null,
    val bpjs_kesehatan_number: String? = null,
    val bpjs_tk_number: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val has_bpjs_tk: Boolean = false,
    val photo_url: String? = null,
    val department_name: String? = null,
    val branch_name: String? = null,
    val card_uuid: String? = null,
    val badge_token: String? = null,
    val card_bio: String? = null,
    val card_links: List<CardLinkItem> = emptyList()
)

@Serializable
data class UpdateEmployeePhotoRequest(
    val photo_base64: String
)

@Serializable
data class UpdateEmployeePhotoResponse(
    val message: String = "",
    val photo_url: String? = null
)

@Serializable
data class UpdateContactRequest(
    val phone: String,
    val address: String
)

@Serializable
data class UpdateBankDetailsRequest(
    val bank_name: String,
    val bank_swift_code: String,
    val bank_branch_name: String,
    val bank_branch_code: String,
    val bank_branch_address: String,
    val bank_account_number: String,
    val bank_account_holder: String
)

@Serializable
data class ReviewRequestBody(
    val status: String,
    val note: String? = null
)

@Serializable
data class CorrectionsResponse(
    val corrections: List<AttendanceCorrectionItem> = emptyList()
)

@Serializable
data class AttendanceCorrectionItem(
    val id: String,
    val employee_id: String? = null,
    val full_name: String? = null,
    val nik: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val correction_date: String = "",
    val requested_clock_in: String? = null,
    val requested_clock_out: String? = null,
    val reason: String? = null,
    val status: String = "pending",
    val reviewer_note: String? = null,
    val created_at: String? = null
)

@Serializable
data class AnnouncementsResponse(
    val announcements: List<AnnouncementItem> = emptyList()
)

@Serializable
data class AnnouncementItem(
    val id: String,
    val title: String = "",
    val body: String = "",
    val category: String = "memo",
    @Serializable(with = FlexibleBooleanSerializer::class) val require_ack: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val pinned: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val acknowledged: Boolean = false,
    val publisher_name: String? = null,
    val published_at: String? = null,
    val expires_at: String? = null,
    val attachment_name: String? = null,
    val attachment_url: String? = null
)

@Serializable
data class AnnouncementAckResponse(
    @Serializable(with = FlexibleBooleanSerializer::class) val acknowledged: Boolean = true
)

@Serializable
data class ShiftRosterResponse(
    val roster: List<RosterItem> = emptyList()
)

@Serializable
data class RosterItem(
    val id: String,
    val employee_id: String = "",
    val date: String = "",
    val shift_pattern_id: String? = null,
    val shift_name: String? = null,
    val start_time: String? = null,
    val end_time: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class) val is_off: Boolean = false
)

@Serializable
data class TasksResponse(
    val tasks: List<TaskItem> = emptyList(),
    val counts: TaskCounts = TaskCounts()
)

@Serializable
data class TaskCounts(
    val inbox: Int = 0,
    val assigned: Int = 0,
    val approvals: Int = 0,
    val results: Int = 0,
    val overdue: Int = 0,
    val total: Int = 0
)

@Serializable
data class TaskItem(
    val id: String,
    val reference_no: String = "",
    val title: String = "",
    val description: String? = null,
    val category: String = "adhoc",
    val priority: String = "medium",
    val status: String = "open",
    val assignor_id: String = "",
    val assignee_id: String = "",
    val assignor_name: String? = null,
    val assignee_name: String? = null,
    val due_at: String = "",
    val completion_remarks: String? = null,
    val approval_remarks: String? = null,
    val created_at: String? = null
)

@Serializable
data class TaskActionBody(
    val status: String = "in_progress",
    val note: String
)

@Serializable
data class TaskCloseBody(
    val remarks: String
)

@Serializable
data class TaskApproveBody(
    val decision: String = "approve",
    val remarks: String? = null
)

@Serializable
data class TaskEmployeeOption(
    val id: String,
    val nik: String? = null,
    val full_name: String = "",
    val job_title: String? = null,
    val department_name: String? = null
)

@Serializable
data class TaskMetaResponse(
    val companyName: String = "",
    val nextReferenceNo: String = "TMS",
    val employees: List<TaskEmployeeOption> = emptyList()
)

@Serializable
data class CreateTaskBody(
    val title: String,
    val description: String? = null,
    val category: String = "general",
    val priority: String = "medium",
    val assignee_id: String,
    val due_at: String,
    val remarks: String? = null
)

@Serializable
data class CreateTaskResponse(
    val message: String = "",
    val task: TaskItem? = null
)

@Serializable
data class TaskActivityItem(
    val id: String = "",
    val task_id: String = "",
    val actor_id: String? = null,
    val actor_name: String? = null,
    val action_type: String = "",
    val status_after: String? = null,
    val note: String? = null,
    val created_at: String = ""
)

@Serializable
data class TaskAttachmentItem(
    val id: String = "",
    val file_name: String = "",
    val mime_type: String? = null,
    val file_size: Long = 0L,
    val url: String = ""
)

@Serializable
data class TaskDetailResponse(
    val task: TaskItem,
    val activities: List<TaskActivityItem> = emptyList(),
    val attachments: List<TaskAttachmentItem> = emptyList()
)

@Serializable
data class TaskHandoverBody(
    val next_assignee_id: String,
    val reason: String
)

@Serializable
data class TaskRescheduleBody(
    val due_at: String,
    val reason: String
)

@Serializable
data class PettyCashRequestsResponse(
    val requests: List<PettyCashRequestItem> = emptyList()
)

@Serializable
data class PettyCashRequestItem(
    val id: String,
    val employee_id: String? = null,
    val full_name: String? = null,
    val nik: String? = null,
    val job_title: String? = null,
    val department_name: String? = null,
    val reference_no: String = "",
    val department_label: String? = null,
    val purpose: String = "",
    val requested_amount: Double = 0.0,
    val approved_amount: Double? = null,
    val disbursed_amount: Double? = null,
    val total_realized: Double = 0.0,
    val variance: Double = 0.0,
    val status: String = "pending",
    val rejection_note: String? = null,
    val report_note: String? = null,
    val approver_name: String? = null,
    val reviewer_name: String? = null,
    val expense_count: Int = 0,
    val receipt_count: Int = 0,
    val created_at: String? = null
)

@Serializable
data class CreatePettyCashRequest(
    val purpose: String,
    val requested_amount: Double
)

@Serializable
data class ApprovePettyCashBody(
    val disbursed_amount: Double? = null
)

@Serializable
data class PettyCashDetailResponse(
    val request: PettyCashRequestItem,
    val expenses: List<PettyCashExpenseItem> = emptyList(),
    val totals: PettyCashTotals = PettyCashTotals(),
    val rights: PettyCashRights = PettyCashRights()
)

@Serializable
data class PettyCashTotals(
    val requested_amount: Double = 0.0,
    val disbursed_amount: Double = 0.0,
    val total_realized: Double = 0.0,
    val variance: Double = 0.0
)

@Serializable
data class PettyCashRights(
    @Serializable(with = FlexibleBooleanSerializer::class) val canApprove: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val canReject: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val canCancel: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val canEditExpenses: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val canSubmitReport: Boolean = false,
    @Serializable(with = FlexibleBooleanSerializer::class) val canReviewReport: Boolean = false
)

@Serializable
data class PettyCashExpenseItem(
    val id: String,
    val request_id: String = "",
    val expense_date: String = "",
    val category: String = "other",
    val description: String = "",
    val amount: Double = 0.0,
    val vendor: String? = null,
    val notes: String? = null,
    val receipts: List<PettyCashReceiptItem> = emptyList()
)

@Serializable
data class PettyCashReceiptItem(
    val id: String,
    val request_id: String = "",
    val expense_id: String = "",
    val file_name: String = "receipt",
    val mime_type: String? = null,
    val file_size: Long = 0,
    val url: String? = null
)

@Serializable
data class PettyCashReceiptUpload(
    val base64: String,
    val mime_type: String = "image/jpeg",
    val file_name: String = "receipt.jpg"
)

@Serializable
data class AddPettyCashExpenseRequest(
    val expense_date: String,
    val category: String,
    val description: String,
    val amount: Double,
    val vendor: String? = null,
    val notes: String? = null,
    val receipts: List<PettyCashReceiptUpload> = emptyList()
)

@Serializable
data class UploadPettyCashReceiptRequest(
    val base64: String,
    val mime_type: String = "image/jpeg",
    val file_name: String = "receipt.jpg"
)

@Serializable
data class MyAssetsResponse(
    val assets: List<AssignedAssetItem> = emptyList()
)

@Serializable
data class AssignedAssetItem(
    val id: String,
    val asset_tag: String = "",
    val name: String = "",
    val category: String = "laptop",
    val serial_number: String? = null,
    val condition: String = "good",
    val condition_out: String? = null,
    val assigned_at: String? = null,
    val expected_return_at: String? = null,
    val notes: String? = null
)

@Serializable
data class SigningRequestsResponse(
    val signingRequests: List<SigningRequestItem> = emptyList()
)

@Serializable
data class SigningRequestItem(
    val id: String,
    val employee_id: String? = null,
    val employee_name: String? = null,
    val template_code: String? = null,
    val workflow: String? = null,
    val status: String = "sent",
    val due_at: String? = null,
    val completed_at: String? = null,
    val signer_total: Int = 0,
    val signer_signed: Int = 0,
    val document_count: Int = 0,
    val created_at: String? = null
)
