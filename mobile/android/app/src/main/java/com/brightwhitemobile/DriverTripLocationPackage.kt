package com.brightwhitemobile

import android.content.Intent
import android.content.Context
import android.location.LocationManager
import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

class DriverTripLocationPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(DriverTripLocationModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class DriverTripLocationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "DriverTripLocation"

  @ReactMethod
  fun start(assignmentId: String, token: String, apiBaseUrl: String, promise: Promise) {
    if (assignmentId.isBlank() || token.isBlank() || apiBaseUrl.isBlank()) {
      promise.reject("INVALID_TRIP", "An active trip and session are required")
      return
    }
    try {
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER) &&
          !manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
        promise.reject("GPS_UNAVAILABLE", "Turn on Location Services before starting this trip")
        return
      }
      val intent = Intent(context, DriverTripLocationService::class.java).apply {
        action = DriverTripLocationService.ACTION_START
        putExtra(DriverTripLocationService.EXTRA_ASSIGNMENT_ID, assignmentId)
        putExtra(DriverTripLocationService.EXTRA_TOKEN, token)
        putExtra(DriverTripLocationService.EXTRA_API_URL, apiBaseUrl)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("TRIP_GPS_UNAVAILABLE", "Unable to start background GPS", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      context.stopService(Intent(context, DriverTripLocationService::class.java))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("TRIP_GPS_STOP_FAILED", "Unable to stop background GPS", error)
    }
  }
}
