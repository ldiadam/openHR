# Keep Kotlinx Serialization generated serializers
-keepattributes *Annotation*, InnerClasses, Signature
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class id.openhr.ess.data.model.**$$serializer { *; }
-keepclassmembers class id.openhr.ess.data.model.** {
    *** Companion;
}
-keep class id.openhr.ess.data.model.** { *; }

# Retrofit & OkHttp
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
-keepattributes Exceptions, InnerClasses, Signature
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# MapLibre
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**

# ZXing
-keep class com.google.zxing.** { *; }
