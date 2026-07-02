#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the plugin with the Capacitor bridge under the name "FoundationLLM"
// so the webview can reach it via Capacitor.registerPlugin("FoundationLLM").
CAP_PLUGIN(FoundationLLMPlugin, "FoundationLLM",
  CAP_PLUGIN_METHOD(availability, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(generate, CAPPluginReturnPromise);
)
