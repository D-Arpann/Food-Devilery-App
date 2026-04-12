export { createAppClient } from './client.js'
export {
  sendPhoneOtp,
  verifyPhoneOtp,
  upsertCurrentUserProfile,
  verifyOtpAndSyncProfile,
  completeSignupProfile,
  logout,
} from './auth.js'
export {
  fetchActiveRestaurants,
  fetchActiveMenu,
  fetchRestaurantFeed,
  createOrder,
  createCheckoutOrder,
  updateOrderStatus,
} from './queries.js'
