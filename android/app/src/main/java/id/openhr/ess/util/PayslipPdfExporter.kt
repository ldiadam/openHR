package id.openhr.ess.util

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import id.openhr.ess.data.model.PayslipDetail
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

data class PayslipLineItem(
    val label: String,
    val amount: Double,
    val subLabel: String? = null
)

data class PayslipBreakdown(
    val earnings: List<PayslipLineItem>,
    val grossEarningsDisplay: Double,
    val deductions: List<PayslipLineItem>,
    val employerContributions: List<PayslipLineItem>
)

object PayslipCalculator {
    fun formatCount(value: Double): String {
        return if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
    }

    fun compute(payslip: PayslipDetail, lang: String): PayslipBreakdown {
        fun tr(id: String, en: String) = if (lang == "id") id else en

        val prorationDelta = payslip.prorated_salary - payslip.base_salary
        val earnings = buildList {
            add(PayslipLineItem(tr("Gaji Pokok", "Base Salary"), payslip.base_salary))
            if (abs(prorationDelta) > 0.009) {
                add(
                    PayslipLineItem(
                        tr(
                            "Penyesuaian Prorata (${formatCount(payslip.days_worked)}/${formatCount(payslip.expected_working_days)} hari)",
                            "Proration Adjustment (${formatCount(payslip.days_worked)}/${formatCount(payslip.expected_working_days)} days)"
                        ),
                        prorationDelta
                    )
                )
            }
            add(PayslipLineItem(tr("Tunjangan Tetap", "Fixed Allowance"), payslip.fixed_allowance))
            if (payslip.thr_amount > 0) {
                add(PayslipLineItem(tr("THR (Tunjangan Hari Raya)", "THR (Holiday Allowance)"), payslip.thr_amount))
            }
            if (payslip.overtime_pay > 0) {
                add(
                    PayslipLineItem(
                        tr(
                            "Upah Lembur (${formatCount(payslip.overtime_hours)} jam)",
                            "Overtime Pay (${formatCount(payslip.overtime_hours)} hrs)"
                        ),
                        payslip.overtime_pay
                    )
                )
            }
            if (payslip.attendance_bonus > 0) {
                add(PayslipLineItem(tr("Bonus Kehadiran", "Attendance Bonus"), payslip.attendance_bonus))
            }
            if (payslip.commission_bonus > 0) {
                add(PayslipLineItem(tr("Komisi / Bonus", "Commission / Bonus"), payslip.commission_bonus))
            }
        }

        // Matches web PayslipModal: reimbursements are non-earning / non-taxable; older rows with
        // reimbursement baked into gross_earnings reconcile to earningsTotal.
        val earningsTotal = earnings.sumOf { it.amount }
        val grossEarningsDisplay =
            if (payslip.reimbursement_amount > 0 &&
                abs(payslip.gross_earnings - (earningsTotal + payslip.reimbursement_amount)) < 0.01
            ) {
                earningsTotal
            } else {
                payslip.gross_earnings
            }

        val alphaRate = if (payslip.alpha_daily_rate_exact > 0) payslip.alpha_daily_rate_exact else payslip.alpha_daily_rate
        val deductions = buildList {
            if (payslip.bpjs_kes_employee > 0) {
                add(PayslipLineItem(tr("BPJS Kesehatan (1%)", "BPJS Health (1%)"), payslip.bpjs_kes_employee))
            }
            if (payslip.bpjs_jht_employee > 0) {
                add(PayslipLineItem("BPJS JHT (2%)", payslip.bpjs_jht_employee))
            }
            if (payslip.bpjs_jp_employee > 0) {
                add(PayslipLineItem("BPJS JP (1%)", payslip.bpjs_jp_employee))
            }
            if (payslip.pph21_amount > 0) {
                val method = payslip.pph21_method ?: "-"
                add(PayslipLineItem(tr("PPh 21 ($method)", "Income Tax PPh 21 ($method)"), payslip.pph21_amount))
            }
            if (payslip.kasbon_deduction > 0) {
                add(PayslipLineItem(tr("Cicilan Kasbon", "Salary Advance"), payslip.kasbon_deduction))
            }
            if (payslip.late_deduction > 0) {
                add(PayslipLineItem(tr("Potongan Terlambat", "Late Deduction"), payslip.late_deduction))
            }
            if (payslip.unpaid_leave_deduction > 0) {
                add(PayslipLineItem(tr("Cuti Tidak Berbayar", "Unpaid Leave"), payslip.unpaid_leave_deduction))
            }
            if (payslip.alpha_deduction > 0) {
                add(
                    PayslipLineItem(
                        label = tr("Alpa / Tanpa Keterangan", "Absence Without Notice"),
                        amount = payslip.alpha_deduction,
                        subLabel = "${Formatters.formatRupiah(alphaRate)} × ${formatCount(payslip.alpha_days)}"
                    )
                )
            }
            if (payslip.other_deductions > 0) {
                val reasonId = payslip.other_deductions_reason?.ifBlank { null } ?: "Koreksi"
                val reasonEn = payslip.other_deductions_reason?.ifBlank { null } ?: "Correction"
                add(
                    PayslipLineItem(
                        tr("Lain-lain ($reasonId)", "Other ($reasonEn)"),
                        payslip.other_deductions
                    )
                )
            }
        }

        val jkk = if (payslip.jkk_employer > 0) payslip.jkk_employer else payslip.bpjs_jkk_employer
        val jkm = if (payslip.jkm_employer > 0) payslip.jkm_employer else payslip.bpjs_jkm_employer
        val employerContributions = listOf(
            PayslipLineItem(tr("BPJS Kesehatan (4%)", "BPJS Health (4%)"), payslip.bpjs_kes_employer),
            PayslipLineItem("BPJS JHT (3.7%)", payslip.bpjs_jht_employer),
            PayslipLineItem("BPJS JP (2%)", payslip.bpjs_jp_employer),
            PayslipLineItem("BPJS JKK (0.24%)", jkk),
            PayslipLineItem("BPJS JKM (0.3%)", jkm)
        ).filter { it.amount > 0 }

        return PayslipBreakdown(
            earnings = earnings,
            grossEarningsDisplay = grossEarningsDisplay,
            deductions = deductions,
            employerContributions = employerContributions
        )
    }
}

object PayslipPdfExporter {
    fun exportAndOpen(context: Context, payslip: PayslipDetail, lang: String = "id"): File {
        val file = generatePdfFile(context, payslip, lang)
        fun tr(id: String, en: String) = if (lang == "id") id else en
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(viewIntent, tr("Buka Slip Gaji PDF", "Open Payslip PDF"))
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
        return file
    }

    fun generatePdfFile(context: Context, payslip: PayslipDetail, lang: String = "id"): File {
        fun tr(id: String, en: String) = if (lang == "id") id else en
        val breakdown = PayslipCalculator.compute(payslip, lang)

        val doc = PdfDocument()
        val pageWidth = 595 // A4 points
        val pageHeight = 842
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas

        val margin = 38f
        val contentWidth = pageWidth - margin * 2
        var y = 44f

        val titlePaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            textSize = 15f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val subtitlePaint = Paint().apply {
            color = Color.parseColor("#64748B")
            textSize = 9f
        }
        val sectionPaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            textSize = 10f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val bodyPaint = Paint().apply {
            color = Color.parseColor("#1E293B")
            textSize = 9.5f
        }
        val rightPaint = Paint(bodyPaint).apply {
            textAlign = Paint.Align.RIGHT
        }
        val boldRightPaint = Paint(sectionPaint).apply {
            textAlign = Paint.Align.RIGHT
        }
        val linePaint = Paint().apply {
            color = Color.parseColor("#CBD5E1")
            strokeWidth = 1f
        }
        val darkLinePaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            strokeWidth = 1.6f
        }
        val boxFillPaint = Paint().apply {
            color = Color.parseColor("#F8FAFC")
            style = Paint.Style.FILL
        }
        val netBgPaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            style = Paint.Style.FILL
        }

        // Letterhead
        canvas.drawText(tr("SLIP GAJI KARYAWAN", "EMPLOYEE PAYSLIP"), margin, y, subtitlePaint)
        canvas.drawText(tr("RAHASIA", "CONFIDENTIAL"), pageWidth - margin, y, boldRightPaint)
        y += 16f
        canvas.drawText(payslip.company_name ?: "openHR", margin, y, titlePaint)
        canvas.drawText(payslip.run_title ?: "-", pageWidth - margin, y, boldRightPaint)
        y += 13f
        canvas.drawText(payslip.company_address ?: "-", margin, y, subtitlePaint)
        canvas.drawText(
            "${tr("Periode", "Period")}: ${Formatters.formatDisplayDate(payslip.period_start, lang)} – ${Formatters.formatDisplayDate(payslip.period_end, lang)}",
            pageWidth - margin,
            y,
            Paint(subtitlePaint).apply { textAlign = Paint.Align.RIGHT }
        )
        y += 12f
        if (!payslip.company_npwp.isNullOrBlank()) {
            canvas.drawText("NPWP: ${payslip.company_npwp}", margin, y, subtitlePaint)
        }
        val paymentDate = Formatters.formatDisplayDate(payslip.payment_date ?: payslip.period_end, lang)
        canvas.drawText(
            "${tr("Tanggal Bayar", "Payment Date")}: $paymentDate",
            pageWidth - margin,
            y,
            Paint(subtitlePaint).apply { textAlign = Paint.Align.RIGHT }
        )
        y += 10f
        canvas.drawLine(margin, y, pageWidth - margin, y, darkLinePaint)
        y += 16f

        // Employee Metadata (matches 9 fields from Web)
        fun drawMetaRow(l1: String, v1: String, l2: String, v2: String, l3: String, v3: String) {
            val colW = contentWidth / 3f
            canvas.drawText(l1, margin, y, subtitlePaint)
            canvas.drawText(l2, margin + colW, y, subtitlePaint)
            canvas.drawText(l3, margin + colW * 2f, y, subtitlePaint)
            y += 11f
            canvas.drawText(v1, margin, y, sectionPaint)
            canvas.drawText(v2, margin + colW, y, sectionPaint)
            canvas.drawText(v3, margin + colW * 2f, y, sectionPaint)
            y += 16f
        }

        val bankLabel = when {
            !payslip.bank_account_number.isNullOrBlank() ->
                "${payslip.bank_name ?: "-"} · ${payslip.bank_account_number}"
            !payslip.bank_name.isNullOrBlank() ->
                "${payslip.bank_name} · ${tr("belum diisi", "not set")}"
            else -> "-"
        }
        drawMetaRow(
            tr("NAMA KARYAWAN", "EMPLOYEE NAME"), payslip.employee_name ?: "-",
            tr("NIK / ID", "EMPLOYEE ID"), payslip.employee_nik ?: "-",
            tr("JABATAN", "JOB TITLE"), payslip.job_title ?: "-"
        )
        drawMetaRow(
            tr("DEPARTEMEN", "DEPARTMENT"), payslip.department_name ?: "-",
            tr("STATUS PTKP", "TAX STATUS"), payslip.ptkp_status ?: "-",
            tr("REKENING BANK", "BANK ACCOUNT"), bankLabel
        )
        drawMetaRow(
            tr("HARI KERJA", "WORKING DAYS"),
            "${PayslipCalculator.formatCount(payslip.days_worked)} / ${PayslipCalculator.formatCount(payslip.expected_working_days)} ${tr("hari", "days")}",
            tr("LEMBUR DISETUJUI", "APPROVED OVERTIME"),
            "${PayslipCalculator.formatCount(payslip.overtime_hours)} ${tr("jam", "hrs")}",
            tr("METODE PAJAK", "TAX METHOD"), payslip.pph21_method ?: "-"
        )

        canvas.drawLine(margin, y - 4f, pageWidth - margin, y - 4f, linePaint)
        y += 14f

        fun drawMoneyRow(label: String, amount: Double, bold: Boolean = false, subLabel: String? = null) {
            canvas.drawText(label, margin, y, if (bold) sectionPaint else bodyPaint)
            canvas.drawText(Formatters.formatRupiah(amount), pageWidth - margin, y, if (bold) boldRightPaint else rightPaint)
            y += 13.5f
            if (!subLabel.isNullOrBlank()) {
                canvas.drawText(subLabel, margin + 8f, y, subtitlePaint)
                y += 11f
            }
        }

        // Earnings
        canvas.drawText(tr("PENGHASILAN (EARNINGS)", "EARNINGS"), margin, y, sectionPaint)
        y += 14f
        breakdown.earnings.forEach { row -> drawMoneyRow(row.label, row.amount, subLabel = row.subLabel) }
        canvas.drawLine(margin, y - 5f, pageWidth - margin, y - 5f, linePaint)
        y += 6f
        drawMoneyRow(tr("Total Penghasilan Bruto", "Gross Earnings"), breakdown.grossEarningsDisplay, bold = true)

        y += 8f
        // Deductions
        canvas.drawText(tr("POTONGAN (DEDUCTIONS)", "DEDUCTIONS"), margin, y, sectionPaint)
        y += 14f
        if (breakdown.deductions.isEmpty()) {
            val emptyText = if (payslip.total_deductions > 0) {
                tr("Rincian potongan tidak tersedia untuk periode ini", "Deduction breakdown unavailable for this period")
            } else {
                tr("Tidak ada potongan pada periode ini", "No deductions in this period")
            }
            canvas.drawText(emptyText, margin, y, subtitlePaint)
            y += 14f
        } else {
            breakdown.deductions.forEach { row -> drawMoneyRow(row.label, row.amount, subLabel = row.subLabel) }
        }
        canvas.drawLine(margin, y - 5f, pageWidth - margin, y - 5f, linePaint)
        y += 6f
        drawMoneyRow(tr("Total Potongan", "Total Deductions"), payslip.total_deductions, bold = true)

        // Separate Non-Earning Reimbursement Box (matches Web)
        if (payslip.reimbursement_amount > 0) {
            y += 6f
            canvas.drawRect(margin, y, pageWidth - margin, y + 24f, boxFillPaint)
            canvas.drawText(
                tr("Reimbursement (Penggantian Biaya - Bukan Penghasilan)", "Reimbursement (Non-earning · Non-taxable)"),
                margin + 8f,
                y + 15.5f,
                bodyPaint
            )
            canvas.drawText(
                "+${Formatters.formatRupiah(payslip.reimbursement_amount)}",
                pageWidth - margin - 8f,
                y + 15.5f,
                boldRightPaint
            )
            y += 30f
        } else {
            y += 8f
        }

        // Net Pay Band
        canvas.drawRect(margin, y, pageWidth - margin, y + 42f, netBgPaint)
        val whiteLabelPaint = Paint(subtitlePaint).apply { color = Color.parseColor("#CBD5E1") }
        val whiteAmountPaint = Paint(titlePaint).apply {
            color = Color.WHITE
            textSize = 15f
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText(tr("GAJI BERSIH DITERIMA", "NET TAKE-HOME PAY"), margin + 10f, y + 16f, whiteLabelPaint)
        val transferNote = if (!payslip.bank_account_number.isNullOrBlank()) {
            "${tr("Ditransfer ke", "Transferred to")} ${payslip.bank_name ?: "-"} · ${payslip.bank_account_number}"
        } else {
            tr("Nomor rekening belum diisi", "Bank account number not set")
        }
        canvas.drawText(transferNote, margin + 10f, y + 30f, Paint(subtitlePaint).apply { color = Color.parseColor("#94A3B8") })
        canvas.drawText(Formatters.formatRupiah(payslip.take_home_pay), pageWidth - margin - 10f, y + 26f, whiteAmountPaint)
        y += 54f

        // Employer Contributions
        if (breakdown.employerContributions.isNotEmpty()) {
            canvas.drawText(
                tr("KONTRIBUSI PERUSAHAAN (BUKAN POTONGAN GAJI)", "EMPLOYER CONTRIBUTIONS (NOT DEDUCTED FROM PAY)"),
                margin,
                y,
                subtitlePaint
            )
            y += 13f
            breakdown.employerContributions.forEach { row -> drawMoneyRow(row.label, row.amount) }
            canvas.drawLine(margin, y - 5f, pageWidth - margin, y - 5f, linePaint)
            y += 6f
            drawMoneyRow(tr("Total Beban Perusahaan", "Total Employer Cost"), payslip.total_employer_cost, bold = true)
            y += 8f
        }

        // Signatures
        val sigY = maxOf(y + 14f, pageHeight - 96f)
        val rightSigX = pageWidth - margin - 140f
        canvas.drawText(tr("Diterima oleh", "Received by"), margin, sigY, subtitlePaint)
        canvas.drawText(tr("Disahkan oleh", "Authorized by"), rightSigX, sigY, subtitlePaint)
        canvas.drawText(payslip.employee_name ?: "-", margin, sigY + 34f, sectionPaint)
        canvas.drawText(payslip.approver_name ?: payslip.company_name ?: "HR / Finance", rightSigX, sigY + 34f, sectionPaint)
        val authTitle = payslip.approver_title ?: if (payslip.authorized_by_company) tr("Perusahaan", "Company") else null
        if (!authTitle.isNullOrBlank()) {
            canvas.drawText(authTitle, rightSigX, sigY + 45f, subtitlePaint)
        }

        // Confidential footer
        val footerPaint = Paint(subtitlePaint).apply {
            textSize = 8f
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText(
            tr(
                "Dokumen ini bersifat rahasia dan dihasilkan otomatis oleh sistem penggajian. Tidak memerlukan tanda tangan basah.",
                "This document is confidential and generated automatically by the payroll system. No wet signature is required."
            ),
            pageWidth / 2f,
            pageHeight - 22f,
            footerPaint
        )

        doc.finishPage(page)

        val dir = File(context.cacheDir, "payslips").apply { mkdirs() }
        val nik = (payslip.employee_nik ?: "EMP").replace(Regex("[^A-Za-z0-9_-]"), "")
        val safeTitle = (payslip.run_title ?: payslip.id).replace(Regex("[^A-Za-z0-9_-]"), "_")
        val file = File(dir, "Slip_Gaji_${nik}_${safeTitle}.pdf")
        FileOutputStream(file).use { out ->
            doc.writeTo(out)
        }
        doc.close()
        return file
    }
}
