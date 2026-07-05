#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the plugin with the Capacitor bridge under the name "HealthKit"
// so the webview can reach it via Capacitor.registerPlugin("HealthKit").
CAP_PLUGIN(HealthKitPlugin, "HealthKit",
  CAP_PLUGIN_METHOD(availability, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(queryWeight, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(querySteps, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(querySleep, CAPPluginReturnPromise);
)
