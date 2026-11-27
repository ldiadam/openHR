package id.openhr.ess

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import id.openhr.ess.ui.MainShell
import id.openhr.ess.ui.screens.LoginScreen
import id.openhr.ess.ui.theme.OpenHrTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as OpenHrApp

        setContent {
            val user by app.sessionStore.userFlow.collectAsState()
            val token by app.sessionStore.tokenFlow.collectAsState()
            val isLoggedIn = !token.isNullOrBlank() && user != null

            OpenHrTheme {
                AnimatedContent(
                    targetState = isLoggedIn,
                    transitionSpec = {
                        fadeIn(tween(220, easing = FastOutSlowInEasing)) togetherWith
                            fadeOut(tween(160, easing = FastOutSlowInEasing))
                    },
                    label = "auth_transition"
                ) { loggedIn ->
                    if (!loggedIn) {
                        LoginScreen(
                            repository = app.repository,
                            sessionStore = app.sessionStore
                        )
                    } else {
                        MainShell(
                            repository = app.repository,
                            sessionStore = app.sessionStore,
                            apiClient = app.apiClient
                        )
                    }
                }
            }
        }
    }
}
