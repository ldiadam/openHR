import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "id.openhr.ess"
    compileSdk = 35

    defaultConfig {
        applicationId = "id.openhr.ess"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.1.0"
    }

    signingConfigs {
        val storePath = keystoreProperties.getProperty("storeFile") ?: System.getenv("OPENHR_KEYSTORE_PATH")
        val storePass = keystoreProperties.getProperty("storePassword") ?: System.getenv("OPENHR_KEYSTORE_PASSWORD")
        val keyAliasVal = keystoreProperties.getProperty("keyAlias") ?: System.getenv("OPENHR_KEY_ALIAS")
        val keyPass = keystoreProperties.getProperty("keyPassword") ?: System.getenv("OPENHR_KEY_PASSWORD")
        if (!storePath.isNullOrBlank() && !storePass.isNullOrBlank() && !keyAliasVal.isNullOrBlank() && !keyPass.isNullOrBlank()) {
            create("release") {
                storeFile = file(storePath)
                storePassword = storePass
                keyAlias = keyAliasVal
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.play.services)

    implementation(libs.play.services.location)

    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    implementation(libs.coil.compose)
    implementation(libs.zxing.core)
    implementation(libs.maplibre.sdk)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.fragment.ktx)

    testImplementation(libs.junit)
    debugImplementation(libs.androidx.ui.tooling)
}
