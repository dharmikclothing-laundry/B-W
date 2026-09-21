package com.brightwhitemobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** A visible, short-lived foreground service for an active Driver trip only. */
class DriverTripLocationService : Service(), LocationListener {
  companion object {
    const val ACTION_START = "com.brightwhitemobile.START_DRIVER_TRIP_GPS"
    const val EXTRA_ASSIGNMENT_ID = "assignmentId"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_API_URL = "apiUrl"
    private const val CHANNEL_ID = "driver_trip_location"
    private const val NOTIFICATION_ID = 7104
  }

  private val executor = Executors.newSingleThreadExecutor()
  private lateinit var locationManager: LocationManager
  private var assignmentId: String? = null
  private var token: String? = null
  private var apiBaseUrl: String? = null
  private var lastSentAt = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action != ACTION_START) {
      stopSelf()
      return START_NOT_STICKY
    }
    val requestedAssignment = intent.getStringExtra(EXTRA_ASSIGNMENT_ID)
    val requestedToken = intent.getStringExtra(EXTRA_TOKEN)
    val requestedUrl = intent.getStringExtra(EXTRA_API_URL)
    if (requestedAssignment.isNullOrBlank() || requestedToken.isNullOrBlank() || requestedUrl.isNullOrBlank() ||
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
        (!BuildConfig.DEBUG && !requestedUrl.startsWith("https://"))) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (assignmentId == requestedAssignment) {
      token = requestedToken
      apiBaseUrl = requestedUrl.trimEnd('/')
      return START_NOT_STICKY
    }
    if (::locationManager.isInitialized) locationManager.removeUpdates(this)
    assignmentId = requestedAssignment
    token = requestedToken
    apiBaseUrl = requestedUrl.trimEnd('/')
    lastSentAt = 0L
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Active Driver trip location", NotificationManager.IMPORTANCE_LOW))
    }
    val openIntent = Intent(this, MainActivity::class.java)
    val pending = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
      else Notification.Builder(this))
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("B&W active trip")
      .setContentText("Sharing location for your assigned pickup or delivery")
      .setContentIntent(pending)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else startForeground(NOTIFICATION_ID, notification)
    locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
    try {
      locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 0f, this, Looper.getMainLooper())
      locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, 0f, this, Looper.getMainLooper())
    } catch (_: SecurityException) { stopSelf() }
    return START_NOT_STICKY
  }

  override fun onLocationChanged(location: Location) {
    val now = System.currentTimeMillis()
    if (now - lastSentAt < 15000L) return
    lastSentAt = now
    val trip = assignmentId ?: return
    val bearer = token ?: return
    val endpoint = apiBaseUrl ?: return
    executor.execute {
      var connection: HttpURLConnection? = null
      try {
        connection = URL("$endpoint/drivers/me/location").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 15000
        connection.readTimeout = 15000
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Authorization", "Bearer $bearer")
        connection.doOutput = true
        val body = "{\"assignmentId\":\"$trip\",\"latitude\":${location.latitude},\"longitude\":${location.longitude},\"accuracyM\":${location.accuracy}}"
        connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        if (connection.responseCode in listOf(401, 403, 404, 409)) stopSelf()
      } catch (_: Exception) {
        // Network loss will be retried on a later GPS update. No location or token is logged.
      } finally { connection?.disconnect() }
    }
  }

  override fun onProviderDisabled(provider: String) {
    if (::locationManager.isInitialized &&
        !locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) &&
        !locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) stopSelf()
  }

  override fun onDestroy() {
    if (::locationManager.isInitialized) locationManager.removeUpdates(this)
    token = null
    assignmentId = null
    apiBaseUrl = null
    executor.shutdownNow()
    super.onDestroy()
  }
}
