package id.openhr.ess

import android.app.Application
import id.openhr.ess.data.local.SessionStore
import id.openhr.ess.data.remote.ApiClient
import id.openhr.ess.data.repository.EssRepository

class OpenHrApp : Application() {
    lateinit var sessionStore: SessionStore
        private set

    lateinit var apiClient: ApiClient
        private set

    lateinit var repository: EssRepository
        private set

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        apiClient = ApiClient(sessionStore)
        repository = EssRepository(apiClient, sessionStore)
    }
}
