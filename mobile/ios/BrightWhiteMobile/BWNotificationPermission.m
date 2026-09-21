#import <React/RCTBridgeModule.h>
#import <UserNotifications/UserNotifications.h>

@interface BWNotificationPermission : NSObject <RCTBridgeModule>
@end

@implementation BWNotificationPermission

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(requestPermission,
                 requestPermissionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  UNAuthorizationOptions options = UNAuthorizationOptionAlert | UNAuthorizationOptionBadge | UNAuthorizationOptionSound;
  [center requestAuthorizationWithOptions:options completionHandler:^(BOOL granted, NSError *error) {
    if (error != nil) {
      reject(@"notification_permission_error", error.localizedDescription, error);
    } else {
      resolve(@(granted));
    }
  }];
}

@end
