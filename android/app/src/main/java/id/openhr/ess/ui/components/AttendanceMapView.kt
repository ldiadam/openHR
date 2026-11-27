package id.openhr.ess.ui.components

import android.graphics.Color
import android.view.View
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
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.*
import org.maplibre.android.style.sources.GeoJsonSource
import kotlin.math.*

private const val POSITRON_STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
private const val SRC_FENCE = "src-geofence"
private const val SRC_OFFICE = "src-office"
private const val SRC_USER = "src-user"
private const val LAYER_FENCE_FILL = "layer-fence-fill"
private const val LAYER_FENCE_LINE = "layer-fence-line"
private const val LAYER_OFFICE = "layer-office"
private const val LAYER_USER_HALO = "layer-user-halo"
private const val LAYER_USER_DOT = "layer-user-dot"

private fun geofenceGeoJson(lat: Double, lng: Double, radiusMeters: Double, steps: Int = 64): String {
    val earthRadius = 6371000.0
    val latRad = Math.toRadians(lat)
    val dLat = radiusMeters / earthRadius
    val dLng = radiusMeters / (earthRadius * cos(latRad).coerceAtLeast(1e-6))

    val coords = StringBuilder()
    for (i in 0..steps) {
        val angle = 2.0 * Math.PI * (i % steps) / steps
        val pLat = lat + Math.toDegrees(dLat * sin(angle))
        val pLng = lng + Math.toDegrees(dLng * cos(angle))
        if (i > 0) coords.append(',')
        coords.append('[').append(pLng).append(',').append(pLat).append(']')
    }
    return """{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[$coords]]},"properties":{}}"""
}

private fun pointGeoJson(lat: Double, lng: Double): String =
    """{"type":"Feature","geometry":{"type":"Point","coordinates":[$lng,$lat]},"properties":{}}"""

private fun emptyFeatureCollection(): String =
    """{"type":"FeatureCollection","features":[]}"""

private fun computeZoom(lat: Double, lng: Double, office: BranchInfo?): Double {
    if (office?.latitude == null || office.longitude == null) return 15.5
    val dist = Formatters.haversineMeters(lat, lng, office.latitude, office.longitude)
    val radius = (office.radius_meters ?: 150).toDouble()
    val span = max(dist + radius * 2.0, 150.0)
    return when {
        span > 3000 -> 11.2
        span > 1500 -> 12.2
        span > 700 -> 13.2
        span > 350 -> 14.2
        span > 150 -> 15.0
        else -> 15.8
    }
}

private fun updateMapOverlays(style: Style, lat: Double, lng: Double, office: BranchInfo?) {
    val fenceJson = if (office?.latitude != null && office.longitude != null) {
        geofenceGeoJson(office.latitude, office.longitude, (office.radius_meters ?: 150).toDouble())
    } else {
        emptyFeatureCollection()
    }
    val officeJson = if (office?.latitude != null && office.longitude != null) {
        pointGeoJson(office.latitude, office.longitude)
    } else {
        emptyFeatureCollection()
    }
    val userJson = pointGeoJson(lat, lng)

    (style.getSource(SRC_FENCE) as? GeoJsonSource)?.setGeoJson(fenceJson)
        ?: run {
            style.addSource(GeoJsonSource(SRC_FENCE, fenceJson))
            style.addLayer(
                FillLayer(LAYER_FENCE_FILL, SRC_FENCE).withProperties(
                    fillColor(Color.parseColor("#2563EB")),
                    fillOpacity(0.14f)
                )
            )
            style.addLayer(
                LineLayer(LAYER_FENCE_LINE, SRC_FENCE).withProperties(
                    lineColor(Color.parseColor("#2563EB")),
                    lineWidth(1.8f),
                    lineOpacity(0.85f)
                )
            )
        }

    (style.getSource(SRC_OFFICE) as? GeoJsonSource)?.setGeoJson(officeJson)
        ?: run {
            style.addSource(GeoJsonSource(SRC_OFFICE, officeJson))
            style.addLayer(
                CircleLayer(LAYER_OFFICE, SRC_OFFICE).withProperties(
                    circleRadius(6.5f),
                    circleColor(Color.parseColor("#1D4ED8")),
                    circleStrokeWidth(2f),
                    circleStrokeColor(Color.WHITE)
                )
            )
        }

    (style.getSource(SRC_USER) as? GeoJsonSource)?.setGeoJson(userJson)
        ?: run {
            style.addSource(GeoJsonSource(SRC_USER, userJson))
            style.addLayer(
                CircleLayer(LAYER_USER_HALO, SRC_USER).withProperties(
                    circleRadius(14f),
                    circleColor(Color.parseColor("#3B82F6")),
                    circleOpacity(0.24f)
                )
            )
            style.addLayer(
                CircleLayer(LAYER_USER_DOT, SRC_USER).withProperties(
                    circleRadius(7f),
                    circleColor(Color.parseColor("#2563EB")),
                    circleStrokeWidth(2.5f),
                    circleStrokeColor(Color.WHITE)
                )
            )
        }
}

private fun moveCameraToView(map: MapLibreMap, lat: Double, lng: Double, office: BranchInfo?, animate: Boolean) {
    val officeLat = office?.latitude
    val officeLng = office?.longitude
    val zoom = computeZoom(lat, lng, office)
    val centerLat = if (officeLat != null) (lat + officeLat) / 2.0 else lat
    val centerLng = if (officeLng != null) (lng + officeLng) / 2.0 else lng
    val latOffset = when {
        zoom >= 15.5 -> 0.0014
        zoom >= 14.5 -> 0.0028
        zoom >= 13.5 -> 0.0055
        zoom >= 12.5 -> 0.011
        else -> 0.02
    }
    val position = CameraPosition.Builder()
        .target(LatLng(centerLat - latOffset, centerLng))
        .zoom(zoom)
        .build()
    if (animate) {
        map.animateCamera(CameraUpdateFactory.newCameraPosition(position), 450)
    } else {
        map.moveCamera(CameraUpdateFactory.newCameraPosition(position))
    }
}

@Composable
fun AttendanceMapView(
    lat: Double,
    lng: Double,
    office: BranchInfo?,
    isVisible: Boolean = true,
    recenterTrigger: Int = 0,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val mapView = remember {
        MapLibre.getInstance(context.applicationContext)
        MapView(context).apply {
            onCreate(null)
            clipToOutline = true
        }
    }

    val mapRef = remember { arrayOfNulls<MapLibreMap>(1) }
    val latestArgs = remember { arrayOfNulls<Any?>(3) }
    val lastCameraArgs = remember { arrayOfNulls<Any?>(4) }

    DisposableEffect(lifecycleOwner, mapView) {
        mapView.getMapAsync { map ->
            mapRef[0] = map
            map.uiSettings.apply {
                isAttributionEnabled = false
                isLogoEnabled = false
                isCompassEnabled = false
                isRotateGesturesEnabled = false
                isTiltGesturesEnabled = false
            }
            map.setStyle(Style.Builder().fromUri(POSITRON_STYLE_URL)) { style ->
                val curLat = (latestArgs[0] as? Double) ?: lat
                val curLng = (latestArgs[1] as? Double) ?: lng
                val curOffice = latestArgs[2] as? BranchInfo
                updateMapOverlays(style, curLat, curLng, curOffice)
                moveCameraToView(map, curLat, curLng, curOffice, animate = false)
            }
        }

        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> if (isVisible) mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    DisposableEffect(isVisible, mapView) {
        if (isVisible) {
            mapView.onStart()
            mapView.onResume()
        } else {
            mapView.onPause()
        }
        onDispose { }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { view ->
            view.visibility = if (isVisible) View.VISIBLE else View.INVISIBLE
            val argsChanged = latestArgs[0] != lat || latestArgs[1] != lng || latestArgs[2] != office
            val recenterChanged = lastCameraArgs[3] != recenterTrigger
            if (!argsChanged && !recenterChanged) return@AndroidView

            latestArgs[0] = lat
            latestArgs[1] = lng
            latestArgs[2] = office

            val map = mapRef[0] ?: return@AndroidView
            map.style?.let { style ->
                if (style.isFullyLoaded) {
                    updateMapOverlays(style, lat, lng, office)
                }
            }
            val camChanged = lastCameraArgs[0] != lat ||
                lastCameraArgs[1] != lng ||
                lastCameraArgs[2] != office ||
                recenterChanged
            if (camChanged) {
                val shouldAnimate = lastCameraArgs[0] != null
                lastCameraArgs[0] = lat
                lastCameraArgs[1] = lng
                lastCameraArgs[2] = office
                lastCameraArgs[3] = recenterTrigger
                moveCameraToView(map, lat, lng, office, animate = shouldAnimate)
            }
        }
    )
}
