package id.openhr.ess.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.util.Base64
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

object FaceMath {
    const val DEFAULT_MATCH_THRESHOLD = 0.72f

    fun l2Normalize(vector: FloatArray): FloatArray {
        var sumSq = 0.0
        for (v in vector) {
            sumSq += (v * v).toDouble()
        }
        val norm = sqrt(sumSq).toFloat()
        if (norm <= 1e-6f) return vector.copyOf()
        return FloatArray(vector.size) { i -> vector[i] / norm }
    }

    fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.isEmpty() || a.size != b.size) return 0f
        var dot = 0.0
        var normA = 0.0
        var normB = 0.0
        for (i in a.indices) {
            val va = a[i].toDouble()
            val vb = b[i].toDouble()
            dot += va * vb
            normA += va * va
            normB += vb * vb
        }
        val denom = sqrt(normA) * sqrt(normB)
        if (denom <= 1e-8) return 0f
        return (dot / denom).toFloat().coerceIn(-1f, 1f)
    }
}

sealed interface FaceExtractResult {
    data class Success(val embedding: FloatArray) : FaceExtractResult
    data object NoFace : FaceExtractResult
    data class Error(val message: String) : FaceExtractResult
}

object FaceRecognizer {
    private const val MODEL_ASSET = "mobilefacenet.tflite"
    private const val INPUT_SIZE = 112

    @Volatile
    private var cachedInterpreter: Interpreter? = null

    private val detectorOptions by lazy {
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setMinFaceSize(0.18f)
            .build()
    }

    private fun getInterpreter(context: Context): Interpreter {
        cachedInterpreter?.let { return it }
        synchronized(this) {
            cachedInterpreter?.let { return it }
            val modelBuffer = loadModelFile(context.applicationContext)
            val options = Interpreter.Options().apply {
                setNumThreads(2)
            }
            return Interpreter(modelBuffer, options).also { cachedInterpreter = it }
        }
    }

    private fun loadModelFile(context: Context): MappedByteBuffer {
        val afd = context.assets.openFd(MODEL_ASSET)
        FileInputStream(afd.fileDescriptor).use { inputStream ->
            return inputStream.channel.map(
                FileChannel.MapMode.READ_ONLY,
                afd.startOffset,
                afd.declaredLength
            )
        }
    }

    suspend fun extractFromDataUrl(context: Context, dataUrl: String): FaceExtractResult =
        withContext(Dispatchers.Default) {
            runCatching {
                val bitmap = decodeDataUrlBitmap(dataUrl)
                    ?: return@withContext FaceExtractResult.Error("Invalid image")
                try {
                    val face = detectLargestFace(bitmap)
                        ?: return@withContext FaceExtractResult.NoFace
                    val cropped = cropAndResizeFace(bitmap, face.boundingBox)
                    try {
                        val embedding = computeEmbedding(context, cropped)
                        FaceExtractResult.Success(embedding)
                    } finally {
                        if (cropped !== bitmap) cropped.recycle()
                    }
                } finally {
                    bitmap.recycle()
                }
            }.getOrElse { err ->
                FaceExtractResult.Error(err.message ?: "Face recognition error")
            }
        }

    suspend fun detectLargestFace(bitmap: Bitmap): Face? {
        val detector = FaceDetection.getClient(detectorOptions)
        return try {
            val faces = detector.process(InputImage.fromBitmap(bitmap, 0)).await()
            faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
        } finally {
            detector.close()
        }
    }

    private fun cropAndResizeFace(source: Bitmap, box: Rect): Bitmap {
        val padX = (box.width() * 0.12f).toInt()
        val padY = (box.height() * 0.12f).toInt()
        val left = max(0, box.left - padX)
        val top = max(0, box.top - padY)
        val right = min(source.width, box.right + padX)
        val bottom = min(source.height, box.bottom + padY)
        val width = max(1, right - left)
        val height = max(1, bottom - top)
        val cropped = Bitmap.createBitmap(source, left, top, width, height)
        val scaled = Bitmap.createScaledBitmap(cropped, INPUT_SIZE, INPUT_SIZE, true)
        if (scaled !== cropped) cropped.recycle()
        return scaled
    }

    private fun computeEmbedding(context: Context, faceBitmap: Bitmap): FloatArray {
        val interpreter = getInterpreter(context)
        val inputBuffer = ByteBuffer.allocateDirect(4 * INPUT_SIZE * INPUT_SIZE * 3).apply {
            order(ByteOrder.nativeOrder())
        }
        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        faceBitmap.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF)
            val g = ((pixel shr 8) and 0xFF)
            val b = (pixel and 0xFF)
            inputBuffer.putFloat((r - 128f) / 128f)
            inputBuffer.putFloat((g - 128f) / 128f)
            inputBuffer.putFloat((b - 128f) / 128f)
        }
        inputBuffer.rewind()

        val outputShape = interpreter.getOutputTensor(0).shape()
        val embDim = if (outputShape.size >= 2) outputShape[1] else 192
        val output = Array(1) { FloatArray(embDim) }
        interpreter.run(inputBuffer, output)
        return FaceMath.l2Normalize(output[0])
    }

    private fun decodeDataUrlBitmap(dataUrl: String): Bitmap? {
        val commaIdx = dataUrl.indexOf(',')
        val base64Part = if (commaIdx >= 0) dataUrl.substring(commaIdx + 1) else dataUrl
        val bytes = Base64.decode(base64Part, Base64.DEFAULT)
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }
}
