package id.openhr.ess.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import id.openhr.ess.data.model.BranchInfo
import id.openhr.ess.util.Formatters
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import java.io.File
import kotlin.math.max

private fun createCartoTileSource(): OnlineTileSourceBase {
    return object : OnlineTileSourceBase(
        "CartoVoyager",
        0,
        19,
        256,
        ".png",
        arrayOf(
            "https://a.basemaps.cartocdn.com/rastertiles/voyager/",
            "https://b.basemaps.cartocdn.com/rastertiles/voyager/",
            "https://c.basemaps.cartocdn.com/rastertiles/voyager/"
        )
    ) {
        override fun getTileURLString(pMapTileIndex: Long): String {
            val z = MapTileIndex.getZoom(pMapTileIndex)
            val x = MapTileIndex.getX(pMapTileIndex)
            val y = MapTileIndex.getY(pMapTileIndex)
            return "$baseUrl$z/$x/$y.png"
        }
    }
}

private fun createUserPinDrawable(context: Context): BitmapDrawable {
    val density = context.resources.displayMetrics.density
    val sizePx = (28 * density).toInt().coerceAtLeast(28)
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val cx = sizePx / 2f
    val cy = sizePx / 2f

    // Soft halo
    val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.argb(65, 37, 99, 235)
    }
    canvas.drawCircle(cx, cy, sizePx * 0.46f, haloPaint)

    // White border
    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
    }
    canvas.drawCircle(cx, cy, sizePx * 0.30f, borderPaint)

    // Blue center dot
    val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(37, 99, 235)
    }
    canvas.drawCircle(cx, cy, sizePx * 0.21f, dotPaint)

    return BitmapDrawable(context.resources, bitmap)
}

private fun createOfficePinDrawable(context: Context): BitmapDrawable {
    val density = context.resources.displayMetrics.density
    val sizePx = (20 * density).toInt().coerceAtLeast(20)
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val r = sizePx * 0.24f

    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
    }
    canvas.drawRoundRect(0f, 0f, sizePx.toFloat(), sizePx.toFloat(), r, r, borderPaint)

    val inset = 2.5f * density
    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(29, 78, 216)
    }
    canvas.drawRoundRect(inset, inset, sizePx - inset, sizePx - inset, r * 0.7f, r * 0.7f, fillPaint)

    return BitmapDrawable(context.resources, bitmap)
}

private fun computeZoom(lat: Double, lng: Double, office: BranchInfo?): Double {
    if (office?.latitude == null || office.longitude == null) return 16.5
    val dist = Formatters.haversineMeters(lat, lng, office.latitude, office.longitude)
    val radius = (office.radius_meters ?: 150).toDouble()
    val span = max(dist + radius * 2.0, 150.0)
    return when {
        span > 3000 -> 11.5
        span > 1500 -> 12.5
        span > 700 -> 13.5
        span > 350 -> 14.5
        span > 150 -> 15.5
        else -> 16.5
    }
}

@Composable
fun AttendanceMapView(
    lat: Double,
    lng: Double,
    office: BranchInfo?,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val mapView = remember {
        Configuration.getInstance().apply {
            userAgentValue = context.packageName
            osmdroidBasePath = File(context.cacheDir, "osmdroid")
            osmdroidTileCache = File(context.cacheDir, "osmdroid/tiles")
        }
        MapView(context).apply {
            setTileSource(createCartoTileSource())
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            isTilesScaledToDpi = true
        }
    }

    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDetach()
        }
    }

    val userDrawable = remember(context) { createUserPinDrawable(context) }
    val officeDrawable = remember(context) { createOfficePinDrawable(context) }
    val lastRendered = remember { arrayOfNulls<Any?>(3) }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { view ->
            if (lastRendered[0] == lat && lastRendered[1] == lng && lastRendered[2] == office) {
                return@AndroidView
            }
            lastRendered[0] = lat
            lastRendered[1] = lng
            lastRendered[2] = office

            view.overlays.clear()

            val userPoint = GeoPoint(lat, lng)
            val officeLat = office?.latitude
            val officeLng = office?.longitude
            val zoom = computeZoom(lat, lng, office)

            if (officeLat != null && officeLng != null) {
                val officePoint = GeoPoint(officeLat, officeLng)
                val radiusMeters = (office.radius_meters ?: 150).toDouble()

                val circlePolygon = Polygon(view).apply {
                    points = Polygon.pointsAsCircle(officePoint, radiusMeters)
                    fillPaint.color = android.graphics.Color.argb(38, 37, 99, 235)
                    outlinePaint.color = android.graphics.Color.argb(210, 37, 99, 235)
                    outlinePaint.strokeWidth = 3f
                }
                view.overlays.add(circlePolygon)

                val officeMarker = Marker(view).apply {
                    position = officePoint
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    icon = officeDrawable
                    title = office.name ?: "Office"
                }
                view.overlays.add(officeMarker)
            }

            val userMarker = Marker(view).apply {
                position = userPoint
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                icon = userDrawable
                setInfoWindow(null)
            }
            view.overlays.add(userMarker)

            val centerLat = if (officeLat != null) (lat + officeLat) / 2.0 else lat
            val centerLng = if (officeLng != null) (lng + officeLng) / 2.0 else lng

            // Offset latitude slightly south so markers appear in the upper half above the floating clock button
            val latOffset = when {
                zoom >= 16.0 -> 0.0012
                zoom >= 15.0 -> 0.0024
                zoom >= 14.0 -> 0.0048
                zoom >= 13.0 -> 0.0095
                else -> 0.018
            }

            view.controller.setZoom(zoom)
            view.controller.setCenter(GeoPoint(centerLat - latOffset, centerLng))
            view.invalidate()
        }
    )
}
