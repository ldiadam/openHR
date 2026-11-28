package id.openhr.ess

import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.ui.components.parseQrServerPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ServerConfigTests {
    @Test
    fun normalizeBaseUrl_returnsEmptyForBlankInput() {
        assertEquals("", SessionStore.normalizeBaseUrl(""))
        assertEquals("", SessionStore.normalizeBaseUrl("   "))
        assertEquals("", SessionStore.normalizeBaseUrl("/"))
    }

    @Test
    fun normalizeBaseUrl_usesHttpsForDomainsAndHttpForLocal() {
        assertEquals("https://hr.example.com", SessionStore.normalizeBaseUrl("hr.example.com/"))
        assertEquals("https://openhr.workers.dev", SessionStore.normalizeBaseUrl("https://openhr.workers.dev/"))
        assertEquals("http://10.0.2.2:8787", SessionStore.normalizeBaseUrl("10.0.2.2:8787/"))
        assertEquals("http://192.168.1.5:8787", SessionStore.normalizeBaseUrl("192.168.1.5:8787"))
    }

    @Test
    fun parseQrServerPayload_handlesJsonAndPlainUrls() {
        val jsonPayload = """{"url":"https://openhr.madadigital.workers.dev","email":"agus@nusantara.id"}"""
        val parsedJson = parseQrServerPayload(jsonPayload)
        assertNotNull(parsedJson)
        assertEquals("https://openhr.madadigital.workers.dev", parsedJson?.url)
        assertEquals("agus@nusantara.id", parsedJson?.email)

        val baseUrlPayload = """{"baseUrl":"https://hr.company.co.id/"}"""
        assertEquals("https://hr.company.co.id/", parseQrServerPayload(baseUrlPayload)?.url)

        val plainHost = parseQrServerPayload("hr.company.co.id")
        assertEquals("hr.company.co.id", plainHost?.url)

        assertNull(parseQrServerPayload("   "))
        assertNull(parseQrServerPayload("not a url"))
    }
}
