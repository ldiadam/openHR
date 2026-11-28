package id.openhr.ess.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sqrt

class FaceMathTest {

    @Test
    fun l2Normalize_producesUnitLengthVector() {
        val normalized = FaceMath.l2Normalize(floatArrayOf(3f, 4f, 0f))
        assertEquals(0.6f, normalized[0], 1e-4f)
        assertEquals(0.8f, normalized[1], 1e-4f)
        assertEquals(0.0f, normalized[2], 1e-4f)
        val norm = sqrt(normalized.sumOf { (it * it).toDouble() })
        assertEquals(1.0, norm, 1e-4)
    }

    @Test
    fun cosineSimilarity_identicalNormalizedVectorsIsOne() {
        val v = FaceMath.l2Normalize(floatArrayOf(1f, 2f, 3f, 4f))
        val sim = FaceMath.cosineSimilarity(v, v.copyOf())
        assertEquals(1.0f, sim, 1e-4f)
    }

    @Test
    fun cosineSimilarity_orthogonalVectorsIsZero() {
        val a = floatArrayOf(1f, 0f, 0f)
        val b = floatArrayOf(0f, 1f, 0f)
        assertEquals(0.0f, FaceMath.cosineSimilarity(a, b), 1e-4f)
    }

    @Test
    fun cosineSimilarity_mismatchedLengthsReturnsZero() {
        assertTrue(FaceMath.cosineSimilarity(floatArrayOf(1f, 2f), floatArrayOf(1f)) == 0f)
    }
}
