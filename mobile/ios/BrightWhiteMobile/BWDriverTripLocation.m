#import <React/RCTBridgeModule.h>
#import <CoreLocation/CoreLocation.h>

@interface BWDriverTripLocation : NSObject <RCTBridgeModule, CLLocationManagerDelegate>
@property (nonatomic, strong) CLLocationManager *manager;
@property (nonatomic, strong) NSTimer *heartbeat;
@property (nonatomic, strong) CLLocation *lastLocation;
@property (nonatomic, copy) NSString *assignmentId;
@property (nonatomic, copy) NSString *accessToken;
@property (nonatomic, copy) NSString *apiBaseURL;
@property (nonatomic, assign) NSTimeInterval lastSentAt;
@property (nonatomic, copy) RCTPromiseResolveBlock pendingResolve;
@property (nonatomic, copy) RCTPromiseRejectBlock pendingReject;
@end

@implementation BWDriverTripLocation

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

- (void)stopInternal {
  [self.heartbeat invalidate];
  self.heartbeat = nil;
  [self.manager stopUpdatingLocation];
  self.assignmentId = nil;
  self.accessToken = nil;
  self.apiBaseURL = nil;
  self.lastLocation = nil;
  self.lastSentAt = 0;
  self.manager.delegate = nil;
  self.manager = nil;
}

- (void)failStart:(NSString *)message {
  RCTPromiseRejectBlock reject = self.pendingReject;
  self.pendingResolve = nil;
  self.pendingReject = nil;
  [self stopInternal];
  if (reject) reject(@"driver_location_permission", message, nil);
}

- (void)beginUpdates {
  if (!self.assignmentId || !self.pendingResolve) return;
  self.manager.activityType = CLActivityTypeAutomotiveNavigation;
  self.manager.desiredAccuracy = kCLLocationAccuracyBest;
  self.manager.distanceFilter = kCLDistanceFilterNone;
  self.manager.pausesLocationUpdatesAutomatically = NO;
  self.manager.allowsBackgroundLocationUpdates = YES;
  self.manager.showsBackgroundLocationIndicator = YES;
  [self.manager startUpdatingLocation];
  self.lastLocation = self.manager.location;
  __weak typeof(self) weakSelf = self;
  self.heartbeat = [NSTimer scheduledTimerWithTimeInterval:15 repeats:YES block:^(__unused NSTimer *timer) {
    [weakSelf publishLatest];
  }];
  [[NSRunLoop mainRunLoop] addTimer:self.heartbeat forMode:NSRunLoopCommonModes];
  RCTPromiseResolveBlock resolve = self.pendingResolve;
  self.pendingResolve = nil;
  self.pendingReject = nil;
  resolve(@YES);
  [self publishLatest];
}

- (void)publishLatest {
  CLLocation *location = self.lastLocation;
  NSString *assignment = self.assignmentId;
  NSString *token = self.accessToken;
  NSString *baseURL = self.apiBaseURL;
  NSTimeInterval now = NSDate.date.timeIntervalSince1970;
  if (!location || !assignment || !token || !baseURL || location.horizontalAccuracy < 0 || now - self.lastSentAt < 15) return;
  self.lastSentAt = now;
  NSURL *url = [NSURL URLWithString:[baseURL stringByAppendingString:@"/drivers/me/location"]];
  if (!url) return;
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"POST";
  request.timeoutInterval = 15;
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  [request setValue:[@"Bearer " stringByAppendingString:token] forHTTPHeaderField:@"Authorization"];
  NSDictionary *body = @{@"assignmentId": assignment, @"latitude": @(location.coordinate.latitude),
                         @"longitude": @(location.coordinate.longitude), @"accuracyM": @(location.horizontalAccuracy)};
  request.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
  __weak typeof(self) weakSelf = self;
  [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(__unused NSData *data, NSURLResponse *response, __unused NSError *error) {
    NSInteger status = [(NSHTTPURLResponse *)response statusCode];
    if (status == 401 || status == 403 || status == 404 || status == 409) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if ([weakSelf.assignmentId isEqualToString:assignment]) [weakSelf stopInternal];
      });
    }
  }] resume];
}

RCT_REMAP_METHOD(start,
                 startAssignment:(NSString *)assignmentId
                 token:(NSString *)token
                 apiBaseURL:(NSString *)apiBaseURL
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL URLWithString:apiBaseURL];
  if (assignmentId.length == 0 || token.length == 0 || !url ||
#if DEBUG
      !( [url.scheme isEqualToString:@"http"] || [url.scheme isEqualToString:@"https"] )
#else
      ![url.scheme isEqualToString:@"https"]
#endif
      ) {
    reject(@"driver_location_config", @"Trip location configuration is unavailable.", nil);
    return;
  }
  if (self.assignmentId && [self.assignmentId isEqualToString:assignmentId] && self.heartbeat) {
    self.accessToken = token;
    resolve(@YES);
    return;
  }
  [self stopInternal];
  if (![CLLocationManager locationServicesEnabled]) {
    reject(@"driver_location_disabled", @"Location Services are unavailable. Enable GPS in Settings.", nil);
    return;
  }
  self.assignmentId = assignmentId;
  self.accessToken = token;
  self.apiBaseURL = [apiBaseURL stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/"]];
  self.pendingResolve = resolve;
  self.pendingReject = reject;
  self.manager = [[CLLocationManager alloc] init];
  self.manager.delegate = self;
  CLAuthorizationStatus status = self.manager.authorizationStatus;
  if (status == kCLAuthorizationStatusAuthorizedAlways) [self beginUpdates];
  else if (status == kCLAuthorizationStatusNotDetermined) [self.manager requestAlwaysAuthorization];
  else if (status == kCLAuthorizationStatusAuthorizedWhenInUse) {
    [self.manager requestAlwaysAuthorization];
    [self failStart:@"Allow Always Location for B&W in Settings to share GPS during navigation."];
  } else [self failStart:@"Location permission denied. Enable Always Location for B&W in Settings."];
}

RCT_REMAP_METHOD(stop, stopWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  if (self.pendingReject) self.pendingReject(@"driver_location_stopped", @"Trip location was stopped.", nil);
  self.pendingResolve = nil;
  self.pendingReject = nil;
  [self stopInternal];
  resolve(@YES);
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
  if (!self.pendingResolve) return;
  if (manager.authorizationStatus == kCLAuthorizationStatusAuthorizedAlways) [self beginUpdates];
  else if (manager.authorizationStatus == kCLAuthorizationStatusDenied ||
           manager.authorizationStatus == kCLAuthorizationStatusRestricted) {
    [self failStart:@"Location permission denied. Enable Always Location for B&W in Settings."];
  } else if (manager.authorizationStatus == kCLAuthorizationStatusAuthorizedWhenInUse) {
    [self failStart:@"Allow Always Location for B&W in Settings to share GPS during navigation."];
  }
}

- (void)locationManager:(__unused CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
  self.lastLocation = locations.lastObject;
  [self publishLatest];
}

- (void)locationManager:(__unused CLLocationManager *)manager didFailWithError:(NSError *)error {
  if (error.code == kCLErrorDenied) [self stopInternal];
}

@end
