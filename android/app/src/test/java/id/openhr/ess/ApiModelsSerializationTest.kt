package id.openhr.ess

import id.openhr.ess.data.model.FlexibleBooleanSerializer
import id.openhr.ess.data.model.LoginResponse
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiModelsSerializationTest {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    @Serializable
    private data class FlagBox(
        @Serializable(with = FlexibleBooleanSerializer::class)
        val active: Boolean
    )

    @Test
    fun flexibleBooleanSerializer_handlesIntsStringsAndBooleans() {
        assertTrue(json.decodeFromString<FlagBox>("""{"active":1}""").active)
        assertFalse(json.decodeFromString<FlagBox>("""{"active":0}""").active)
        assertTrue(json.decodeFromString<FlagBox>("""{"active":true}""").active)
        assertTrue(json.decodeFromString<FlagBox>("""{"active":"1"}""").active)
        assertFalse(json.decodeFromString<FlagBox>("""{"active":"false"}""").active)
    }

    @Test
    fun loginResponse_decodesRefreshTokenAndUser() {
        val raw = """
            {
              "token": "access-jwt",
              "refreshToken": "refresh-opaque-token",
              "user": {
                "id": "u1",
                "email": "agus@nusantara.id",
                "name": "Agus Setiawan",
                "role": "employee"
              }
            }
        """.trimIndent()
        val parsed = json.decodeFromString<LoginResponse>(raw)
        assertEquals("access-jwt", parsed.token)
        assertEquals("refresh-opaque-token", parsed.refreshToken)
        assertEquals("agus@nusantara.id", parsed.user.email)
    }
}
