package com.example.readingpoc

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import java.util.Locale

/**
 * Minimal validation harness for three open risks before building the full reading app:
 * is Google Play Services genuinely present, does the built-in SpeechRecognizer understand
 * Hebrew well enough, and does a background AccessibilityService survive for hours on this
 * specific tablet. See reading-poc-android/README.md for how to run each check.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var tvGmsResult: TextView
    private lateinit var tvSpeechResult: TextView
    private lateinit var tvSupportedLanguagesResult: TextView
    private lateinit var tvHeartbeatResult: TextView

    private var speechRecognizer: SpeechRecognizer? = null
    private val uiHandler = Handler(Looper.getMainLooper())

    private val requestRecordAudioPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startSpeechRecognition() else tvSpeechResult.text = "הרשאת מיקרופון נדחתה"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvGmsResult = findViewById(R.id.tvGmsResult)
        tvSpeechResult = findViewById(R.id.tvSpeechResult)
        tvSupportedLanguagesResult = findViewById(R.id.tvSupportedLanguagesResult)
        tvHeartbeatResult = findViewById(R.id.tvHeartbeatResult)

        findViewById<Button>(R.id.btnCheckGms).setOnClickListener { checkGooglePlayServices() }
        findViewById<Button>(R.id.btnCheckSupportedLanguages).setOnClickListener { checkSupportedLanguages() }
        findViewById<Button>(R.id.btnStartSpeech).setOnClickListener { onSpeechButtonClicked() }
        findViewById<Button>(R.id.btnOpenAccessibilitySettings).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        findViewById<Button>(R.id.btnOpenVoiceInputSettings).setOnClickListener {
            openVoiceInputSettings()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshHeartbeatDisplay()
    }

    private fun refreshHeartbeatDisplay() {
        tvHeartbeatResult.text = HeartbeatAccessibilityService.describeLastHeartbeat(this)
        // Keep refreshing while this screen is visible so you can watch it tick.
        uiHandler.postDelayed({ if (!isFinishing) refreshHeartbeatDisplay() }, 15_000)
    }

    private fun checkGooglePlayServices() {
        val availability = GoogleApiAvailability.getInstance()
        val status = availability.isGooglePlayServicesAvailable(this)
        tvGmsResult.text = if (status == ConnectionResult.SUCCESS) {
            "תקין - Google Play Services זמין"
        } else {
            "בעיה (קוד $status): ${availability.getErrorString(status)}"
        }
    }

    /**
     * EXTRA_LANGUAGE on the recognition intent is a *request*, not a guarantee - many devices
     * (especially budget ones) silently fall back to whatever language is configured for
     * system-wide voice typing if the requested language isn't installed/enabled there. This
     * queries the recognizer directly for the languages it actually supports, so we can tell
     * whether Hebrew is missing entirely (device/OS problem) vs. present but ignored (app bug).
     */
    private fun checkSupportedLanguages() {
        tvSupportedLanguagesResult.text = "בודק..."
        val detailsIntent = Intent(RecognizerIntent.ACTION_GET_LANGUAGE_DETAILS)
        sendOrderedBroadcast(detailsIntent, null, object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val results = getResultExtras(true)
                val supported = results?.getStringArrayList(RecognizerIntent.EXTRA_SUPPORTED_LANGUAGES)
                val preferred = results?.getString(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE)
                val hasHebrew = supported?.any { it.startsWith("he") || it.startsWith("iw") } == true

                tvSupportedLanguagesResult.text = buildString {
                    append("שפת ברירת מחדל של המכשיר: $preferred\n")
                    if (supported.isNullOrEmpty()) {
                        append("לא התקבלה רשימת שפות נתמכות מהמכשיר בכלל (ייתכן שאין שירות זיהוי דיבור שעונה לבקשה הזו).")
                    } else {
                        append(if (hasHebrew) "עברית נמצאת ברשימת השפות הנתמכות.\n" else "עברית לא נמצאת ברשימת השפות הנתמכות!\n")
                        append("סה\"כ ${supported.size} שפות: ${supported.sorted().joinToString(", ")}")
                    }
                }
            }
        }, null, RESULT_OK, null, null)
    }

    private fun openVoiceInputSettings() {
        // There's no single documented action across all OEMs for "voice typing languages",
        // so send the user to general Language & input settings and let them navigate from there.
        startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
    }

    private fun onSpeechButtonClicked() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestRecordAudioPermission.launch(Manifest.permission.RECORD_AUDIO)
        } else {
            startSpeechRecognition()
        }
    }

    private fun startSpeechRecognition() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            tvSpeechResult.text = "אין מנוע זיהוי דיבור זמין במכשיר הזה"
            return
        }

        tvSpeechResult.text = "מקשיב... דבר עכשיו בעברית"

        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle) {
                    val matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    tvSpeechResult.text = if (matches.isNullOrEmpty()) {
                        "לא זוהה טקסט"
                    } else {
                        "זוהה: ${matches.joinToString(" / ")}"
                    }
                }

                override fun onError(error: Int) {
                    tvSpeechResult.text = "שגיאת זיהוי (קוד $error)"
                }

                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }

        val hebrew = Locale("he", "IL").toString()
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, hebrew)
            // Some recognizer implementations key off this extra instead of EXTRA_LANGUAGE.
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, hebrew)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }
        speechRecognizer?.startListening(intent)
    }

    override fun onDestroy() {
        speechRecognizer?.destroy()
        super.onDestroy()
    }
}
