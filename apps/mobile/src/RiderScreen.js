import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  claimRiderJob,
  fetchRiderJobs,
  fetchRiderProfile,
  logout,
  submitRiderApplication,
  subscribeToRiderJobs,
  updateRiderAvailability,
  updateRiderDeliveryStatus,
  updateRiderLocation,
} from '@repo/api';
import { Logo } from '@repo/ui';
import { formatNpr, ORDER_STATUS } from '@repo/utils';
import { RouteMapCard, getRiderRouteTarget } from './RouteMapCard';

const RIDER_COLORS = {
  orange: '#F8964F',
  orangeHot: '#F8964F',
  ink: '#1E1E1E',
  text: '#333232',
  muted: '#5E5E5E',
  line: '#ECECEC',
  warmLine: '#F0E6DD',
  soft: '#FFF4EC',
  bg: '#FFFFFF',
  surfaceMuted: '#FAFAFA',
  white: '#FFFFFF',
  greenBadge: '#E8F5E9',
  greenText: '#2E7D32',
  blueBadge: '#E3F2FD',
  blueText: '#1565C0',
};

function shortId(value = '') {
  return String(value).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'ORDER';
}

function getCustomerName(order) {
  return order?.customer?.full_name || order?.customer?.phone || order?.customer?.email || 'Customer';
}

function getItemCount(order) {
  const lineCount = (order?.lineItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return lineCount || (order?.lineItems?.length || 0);
}

function getNextAction(order) {
  if (order?.status === ORDER_STATUS.READY_FOR_PICKUP && order?.rider_id) {
    return { label: 'Confirm pickup', status: ORDER_STATUS.PICKED_UP };
  }

  if (order?.status === ORDER_STATUS.PICKED_UP) {
    return { label: 'Mark arrived', status: ORDER_STATUS.ARRIVED };
  }

  if (order?.status === ORDER_STATUS.ARRIVED) {
    return { label: 'Complete delivery', status: ORDER_STATUS.DELIVERED };
  }

  return null;
}

function getRestaurantAddress(order) {
  return order?.restaurant?.address || 'Pickup address unavailable';
}

function RoutePreview({ order }) {
  const restaurant = order?.restaurant || {};
  const target = getRiderRouteTarget(order);

  return (
    <RouteMapCard
      order={order}
      title={order?.rider_id ? 'Current route' : 'Pickup map'}
      pickupLabel={restaurant.name || 'Restaurant pickup'}
      pickupAddress={getRestaurantAddress(order)}
      dropoffLabel={target.label}
      dropoffAddress={target.address}
    />
  );
}

function StatusBadge({ status }) {
  let label = status || 'New';
  let bgColor = '#FFF3E8';
  let borderColor = '#F3D7C2';
  let textColor = RIDER_COLORS.orange;

  if (status === ORDER_STATUS.READY_FOR_PICKUP) {
    label = 'Ready';
  } else if (status === ORDER_STATUS.PICKED_UP) {
    label = 'On route';
    bgColor = RIDER_COLORS.greenBadge;
    borderColor = '#C8E6C9';
    textColor = RIDER_COLORS.greenText;
  } else if (status === ORDER_STATUS.ARRIVED) {
    label = 'Arrived';
    bgColor = RIDER_COLORS.blueBadge;
    borderColor = '#BBDEFB';
    textColor = RIDER_COLORS.blueText;
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.statusBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function Metric({ label, value, icon }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <View style={styles.metricIcon}>
          <Ionicons name={icon} size={15} color={RIDER_COLORS.orangeHot} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function RiderRestaurantImage({ uri }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.orderImage} />;
  }

  return (
    <View style={[styles.orderImage, styles.orderImageFallback]}>
      <MaterialCommunityIcons name="storefront-outline" size={24} color={RIDER_COLORS.orangeHot} />
    </View>
  );
}

function OrderCard({ order, type, busy, onClaim, onAdvance }) {
  const restaurant = order?.restaurant || {};
  const nextAction = getNextAction(order);

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHead}>
        <RiderRestaurantImage uri={restaurant.image_url} />
        <View style={styles.orderTitleBlock}>
          <View style={styles.orderKickerRow}>
            <Text style={styles.orderKicker}>#{shortId(order?.id)}</Text>
            <StatusBadge status={order?.status} />
          </View>
          <Text style={styles.orderTitle} numberOfLines={1}>
            {restaurant.name || 'Restaurant'}
          </Text>
        </View>
      </View>

      <View style={styles.orderMetaGrid}>
        <View style={styles.orderMeta}>
          <Ionicons name="person-outline" size={14} color={RIDER_COLORS.muted} />
          <Text style={styles.orderMetaText} numberOfLines={1}>{getCustomerName(order)}</Text>
        </View>
        <View style={styles.orderMeta}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={14} color={RIDER_COLORS.muted} />
          <Text style={styles.orderMetaText}>{getItemCount(order)} items</Text>
        </View>
      </View>

      <RoutePreview order={order} />

      <View style={styles.orderFooter}>
        <View style={styles.orderTotalRow}>
          <Ionicons name="receipt-outline" size={15} color={RIDER_COLORS.ink} />
          <Text style={styles.orderTotal}>{formatNpr(order?.total_amount || 0)}</Text>
        </View>

        {type === 'available' ? (
          <Pressable
            style={[styles.primaryButton, (busy || order._claimDisabled) && styles.buttonDisabled]}
            onPress={() => onClaim(order)}
            disabled={busy || order._claimDisabled}
          >
            <Ionicons name="add-circle-outline" size={16} color={RIDER_COLORS.white} />
            <Text style={styles.primaryButtonText}>{busy ? 'Claiming...' : 'Claim'}</Text>
          </Pressable>
        ) : nextAction ? (
          <Pressable
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={() => onAdvance(order, nextAction.status)}
            disabled={busy}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={RIDER_COLORS.white} />
            <Text style={styles.primaryButtonText}>{busy ? 'Updating...' : nextAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function RiderScreen({ session, supabase, topInset = 0, bottomInset = 0 }) {
  const [profile, setProfile] = useState(null);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reapplyForm, setReapplyForm] = useState({
    bikeModel: '',
    bikeCondition: '',
    licenseFrontFile: null,
    licenseBackFile: null,
  });

  const riderId = session?.user?.id || '';
  const isVerified = profile?.verification_status === 'verified';
  const isRejected = profile?.verification_status === 'rejected';
  const isOnline = Boolean(profile?.is_online);
  const earnings = useMemo(
    () => activeOrders.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0),
    [activeOrders],
  );

  const loadRiderData = useCallback(async ({ quiet = false } = {}) => {
    if (!supabase || !riderId) {
      return;
    }

    if (!quiet) {
      setLoading(true);
    }
    setError('');

    const [{ data: profileData, error: profileError }, { data: jobsData, error: jobsError }] = await Promise.all([
      fetchRiderProfile(supabase, riderId),
      fetchRiderJobs(supabase, { riderId, limit: 20 }),
    ]);

    if (profileError) {
      setError(profileError.message || 'Could not load rider profile.');
    } else {
      setProfile(profileData);
    }

    if (jobsError) {
      setError(jobsError.message || 'Could not load delivery jobs.');
    } else {
      setAvailableJobs(jobsData?.availableJobs || []);
      setActiveOrders(jobsData?.activeOrders || []);
    }

    setLoading(false);
  }, [riderId, supabase]);

  useEffect(() => {
    loadRiderData();
  }, [loadRiderData]);

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    setReapplyForm((current) => ({
      ...current,
      bikeModel: profile.bike_model || '',
      bikeCondition: profile.bike_condition || '',
    }));
  }, [profile?.id, profile?.bike_model, profile?.bike_condition]);

  useEffect(() => {
    if (!supabase || !isVerified) {
      return undefined;
    }

    return subscribeToRiderJobs(
      supabase,
      () => loadRiderData({ quiet: true }),
      () => {},
    );
  }, [isVerified, loadRiderData, supabase]);

  // Auto-refresh every 10 seconds when online
  useEffect(() => {
    if (!supabase || !isVerified || !isOnline) {
      return undefined;
    }

    const timer = setInterval(() => {
      loadRiderData({ quiet: true });
    }, 10000);

    return () => clearInterval(timer);
  }, [isVerified, isOnline, loadRiderData, supabase]);

  useEffect(() => {
    if (!supabase || !isVerified || !isOnline || !activeOrders.length) {
      return undefined;
    }

    let subscription = null;
    let cancelled = false;
    const activeOrder = activeOrders[0];

    async function startLocationWatch() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) {
          setMessage('Location permission is required for live delivery tracking.');
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 7000,
            distanceInterval: 20,
          },
          async (location) => {
            if (cancelled || !activeOrder?.id) {
              return;
            }

            try {
              await updateRiderLocation(supabase, {
                orderId: activeOrder.id,
                coordinates: {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                },
                heading: location.coords.heading,
                speedMps: location.coords.speed,
                accuracyM: location.coords.accuracy,
              });
            } catch (_locationError) {
              // Silently ignore location update errors to avoid crashing the watch
            }
          },
        );
      } catch (_watchError) {
        // Location watch failed to start — device may not support it
      }
    }

    startLocationWatch();

    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, [activeOrders, isOnline, isVerified, loadRiderData, supabase]);

  const handleToggleOnline = async () => {
    if (!isVerified || busyKey) {
      return;
    }

    setBusyKey('availability');
    setMessage('');
    setError('');

    const { data, error: availabilityError } = await updateRiderAvailability(supabase, {
      riderId,
      isOnline: !isOnline,
    });

    if (availabilityError) {
      setError(availabilityError.message || 'Could not update availability.');
    } else {
      setProfile(data);
      setMessage(data?.is_online ? 'You are online.' : 'You are offline.');
      await loadRiderData({ quiet: true });
    }

    setBusyKey('');
  };

  const handleClaim = async (order) => {
    if (activeOrders.length > 0) {
      setError('Complete your current delivery before claiming another.');
      return;
    }

    setBusyKey(`claim-${order.id}`);
    setMessage('');
    setError('');

    const { error: claimError } = await claimRiderJob(supabase, {
      orderId: order.id,
      riderId,
    });

    if (claimError) {
      setError(claimError.message || 'Could not claim this delivery.');
    } else {
      setMessage(`Claimed order #${shortId(order.id)}.`);
      await loadRiderData({ quiet: true });
    }

    setBusyKey('');
  };

  const handleAdvance = async (order, status) => {
    setBusyKey(`status-${order.id}`);
    setMessage('');
    setError('');

    const { error: statusError } = await updateRiderDeliveryStatus(supabase, {
      orderId: order.id,
      riderId,
      status,
    });

    if (statusError) {
      setError(statusError.message || 'Could not update delivery status.');
    } else {
      setMessage(`Order #${shortId(order.id)} updated.`);
      await loadRiderData({ quiet: true });
    }

    setBusyKey('');
  };

  const handleReapplyFieldChange = (field, value) => {
    setReapplyForm((current) => ({ ...current, [field]: value }));
    setError('');
    setMessage('');
  };

  const handlePickLicense = async (side) => {
    setError('');
    setMessage('');

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo access to upload your license.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.88,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError('Choose a clear license photo.');
        return;
      }

      const file = {
        uri: asset.uri,
        name: asset.fileName || `license-${side}-${riderId || 'rider'}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      };

      setReapplyForm((current) => ({
        ...current,
        [side === 'front' ? 'licenseFrontFile' : 'licenseBackFile']: file,
      }));
    } catch (pickerError) {
      setError(pickerError.message || 'Could not open photos.');
    }
  };

  const handleSubmitReapply = async () => {
    const bikeModel = String(reapplyForm.bikeModel || '').trim();
    const bikeCondition = String(reapplyForm.bikeCondition || '').trim();

    if (!bikeModel || !bikeCondition) {
      setError('Add your bike model and condition.');
      setMessage('');
      return;
    }

    if (!reapplyForm.licenseFrontFile || !reapplyForm.licenseBackFile) {
      setError('Upload license front and back images.');
      setMessage('');
      return;
    }

    setBusyKey('reapply');
    setError('');
    setMessage('');

    const { error: reapplyError } = await submitRiderApplication(supabase, {
      riderName: profile?.full_name || session?.user?.user_metadata?.full_name || 'Rider',
      phone: profile?.phone || session?.user?.phone || session?.user?.user_metadata?.phone || '',
      bikeModel,
      bikeCondition,
      licenseFrontFile: reapplyForm.licenseFrontFile,
      licenseBackFile: reapplyForm.licenseBackFile,
    });

    if (reapplyError) {
      setError(reapplyError.message || 'Could not resubmit rider application.');
    } else {
      setMessage('Application resubmitted. Admin verification is required before jobs appear.');
      await supabase.auth.refreshSession().catch(() => {});
      await loadRiderData({ quiet: true });
    }

    setBusyKey('');
  };

  const handleLogout = async () => {
    setBusyKey('logout');
    await logout(supabase);
    setBusyKey('');
  };

  return (
    <View style={[styles.screen, { paddingTop: topInset + 24, paddingBottom: bottomInset + 14 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => loadRiderData()}
            tintColor={RIDER_COLORS.orangeHot}
            colors={[RIDER_COLORS.orangeHot]}
          />
        }
      >
        <View style={styles.frame}>
          <View style={styles.topBar}>
            <View style={styles.riderBrandRow}>
              <Image source={Logo} resizeMode="contain" style={styles.riderBrandLogo} />
              <View>
                <Text style={styles.kicker}>Rider</Text>
                <Text style={styles.title}>Deliveries</Text>
              </View>
            </View>

            <Pressable
              style={[styles.iconButton, busyKey === 'logout' && styles.buttonDisabled]}
              onPress={handleLogout}
              disabled={busyKey === 'logout'}
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={20} color={RIDER_COLORS.ink} />
            </Pressable>
          </View>

          <View style={styles.profilePanel}>
            <View style={styles.profilePanelContent}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.riderAvatarImage} />
              ) : (
                <View style={styles.riderAvatar}>
                  <Text style={styles.riderAvatarText}>{(profile?.full_name || 'R').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.riderHeroText}>
                <Text style={styles.profileName}>{profile?.full_name || 'Rider account'}</Text>
                <Text style={styles.profileMeta}>{profile?.vehicle_details || 'Vehicle details not set'}</Text>
              </View>
              <Pressable
                style={[
                  styles.availabilityButton,
                  isOnline && styles.availabilityButtonOn,
                  (!isVerified || busyKey === 'availability') && styles.buttonDisabled,
                ]}
                onPress={handleToggleOnline}
                disabled={!isVerified || busyKey === 'availability'}
              >
                <MaterialCommunityIcons
                  name={isOnline ? 'toggle-switch' : 'toggle-switch-off-outline'}
                  size={18}
                  color={isOnline ? RIDER_COLORS.orangeHot : RIDER_COLORS.muted}
                />
                <Text style={[styles.availabilityText, isOnline && styles.availabilityTextOn]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </Pressable>
            </View>
          </View>

          {isRejected ? (
            <View style={[styles.notice, styles.rejectedNotice]}>
              <Text style={styles.noticeTitle}>Application rejected</Text>
              <Text style={styles.noticeText}>
                {profile?.rejection_reason || 'Admin could not verify your application. Update the details and submit again.'}
              </Text>

              <View style={styles.reapplyForm}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Bike model</Text>
                  <TextInput
                    value={reapplyForm.bikeModel}
                    onChangeText={(value) => handleReapplyFieldChange('bikeModel', value)}
                    placeholder="Honda Dio"
                    placeholderTextColor="#9B928B"
                    style={styles.textInput}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Bike condition</Text>
                  <TextInput
                    value={reapplyForm.bikeCondition}
                    onChangeText={(value) => handleReapplyFieldChange('bikeCondition', value)}
                    placeholder="Good, serviced recently"
                    placeholderTextColor="#9B928B"
                    style={[styles.textInput, styles.textArea]}
                    multiline
                  />
                </View>

                <View style={styles.licenseGrid}>
                  <Pressable style={styles.licenseButton} onPress={() => handlePickLicense('front')}>
                    <Ionicons name="image-outline" size={18} color={RIDER_COLORS.orangeHot} />
                    <Text style={styles.licenseTitle}>License front</Text>
                    <Text style={styles.licenseText} numberOfLines={1}>
                      {reapplyForm.licenseFrontFile?.name || 'Upload photo'}
                    </Text>
                  </Pressable>

                  <Pressable style={styles.licenseButton} onPress={() => handlePickLicense('back')}>
                    <Ionicons name="image-outline" size={18} color={RIDER_COLORS.orangeHot} />
                    <Text style={styles.licenseTitle}>License back</Text>
                    <Text style={styles.licenseText} numberOfLines={1}>
                      {reapplyForm.licenseBackFile?.name || 'Upload photo'}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.primaryButton, busyKey === 'reapply' && styles.buttonDisabled]}
                  onPress={handleSubmitReapply}
                  disabled={busyKey === 'reapply'}
                >
                  <Ionicons name="refresh-outline" size={16} color={RIDER_COLORS.white} />
                  <Text style={styles.primaryButtonText}>
                    {busyKey === 'reapply' ? 'Submitting...' : 'Resubmit application'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : !isVerified ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>
                {profile?.verification_status === 'suspended' ? 'Account suspended' : 'Application pending'}
              </Text>
              <Text style={styles.noticeText}>
                {profile?.verification_status === 'suspended'
                  ? 'Contact support before accepting deliveries.'
                  : 'Admin approval is required before jobs appear.'}
              </Text>
            </View>
          ) : null}

          {message ? <Text style={styles.successText}>{message}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.metrics}>
            <Metric label="Available" value={availableJobs.length} icon="bag-handle-outline" />
            <Metric label="Active" value={activeOrders.length} icon="navigate-outline" />
            <Metric label="Fees" value={formatNpr(earnings)} icon="wallet-outline" />
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Active deliveries</Text>
          </View>

          <View style={styles.listPanel}>
            {activeOrders.length ? (
              activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  type="active"
                  busy={busyKey === `status-${order.id}`}
                  onAdvance={handleAdvance}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>No active delivery right now.</Text>
            )}
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Ready for pickup</Text>
          </View>

          <View style={styles.listPanel}>
            {availableJobs.length && isOnline ? (
              availableJobs.map((order) => (
                <OrderCard
                  key={order.id}
                  order={{ ...order, _claimDisabled: activeOrders.length > 0 }}
                  type="available"
                  busy={busyKey === `claim-${order.id}`}
                  onClaim={handleClaim}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>
                {isOnline ? 'No pickup jobs available.' : 'Go online to accept pickup jobs.'}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFCF9',
  },
  content: {
    paddingBottom: 28,
  },
  frame: {
    width: '100%',
    maxWidth: 330,
    alignSelf: 'center',
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kicker: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    lineHeight: 28,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: RIDER_COLORS.warmLine,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  profilePanel: {
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RIDER_COLORS.warmLine,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  profileName: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  profileMeta: {
    marginTop: 2,
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  availabilityButton: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#ECECEC',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityButtonOn: {
    borderColor: '#F8964F',
    backgroundColor: '#FFF3E8',
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  availabilityText: {
    color: '#4F4A45',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  availabilityTextOn: {
    color: RIDER_COLORS.orange,
  },
  notice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3D7C2',
    backgroundColor: '#FFF8F2',
    padding: 12,
    marginBottom: 10,
  },
  noticeTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
  },
  noticeText: {
    marginTop: 3,
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  successText: {
    color: '#2D6A33',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    marginBottom: 8,
  },
  errorText: {
    color: '#C12626',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    marginBottom: 8,
  },
  metrics: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RIDER_COLORS.warmLine,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  metric: {
    flex: 1,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: RIDER_COLORS.warmLine,
  },
  metricLabel: {
    color: '#9E9E9E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    marginTop: 6,
    color: '#1E1E1E',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  refreshButton: {
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    color: '#6E6761',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  listPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RIDER_COLORS.warmLine,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  orderCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
  },
  orderHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderTitleBlock: {
    flex: 1,
  },
  orderKicker: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  orderTitle: {
    marginTop: 2,
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 18,
  },
  statusBadge: {
    minHeight: 26,
    borderRadius: 13,
    backgroundColor: '#FFF3E8',
    borderWidth: 1,
    borderColor: '#F3D7C2',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
  },
  orderMetaGrid: {
    marginTop: 9,
    flexDirection: 'row',
    gap: 8,
  },
  orderMeta: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  orderMetaText: {
    flex: 1,
    color: '#5E5852',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
  },
  routePreview: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FAFAFA',
    padding: 10,
    gap: 9,
  },
  routePreviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  routePreviewTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 16,
  },
  routePreviewBadge: {
    minHeight: 23,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3D7C2',
    backgroundColor: '#FFF8F2',
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routePreviewBadgeText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
  },
  routeBody: {
    flexDirection: 'row',
    gap: 10,
  },
  routeRail: {
    width: 14,
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 4,
  },
  routeDotStart: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#F8964F',
  },
  routeLine: {
    width: 1,
    flex: 1,
    minHeight: 28,
    backgroundColor: '#DDD6D0',
    marginVertical: 4,
  },
  routeDotEnd: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#1E1E1E',
  },
  routeTextWrap: {
    flex: 1,
    gap: 10,
  },
  routeLabel: {
    color: '#8C837C',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
  },
  routeAddress: {
    marginTop: 1,
    color: '#2D2B2A',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  addressRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  addressText: {
    flex: 1,
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  orderFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderTotal: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: '#F8964F',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  emptyText: {
    color: '#6E6761',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 14,
  },

  // --- Reference redesign overrides ---
  screen: {
    flex: 1,
    backgroundColor: RIDER_COLORS.bg,
  },
  content: {
    paddingBottom: 28,
  },
  frame: {
    width: '100%',
    paddingHorizontal: 18,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  kicker: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 25,
    lineHeight: 30,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RIDER_COLORS.white,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePanel: {
    minHeight: 132,
    borderRadius: 14,
    backgroundColor: RIDER_COLORS.orange,
    overflow: 'hidden',
    marginBottom: 14,
  },
  profilePanelContent: {
    flex: 1,
    minHeight: 132,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riderAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: RIDER_COLORS.ink,
    borderWidth: 3,
    borderColor: RIDER_COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: {
    color: RIDER_COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 22,
  },
  riderAvatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: RIDER_COLORS.white,
  },
  riderHeroText: {
    flex: 1,
  },
  profileName: {
    color: RIDER_COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    lineHeight: 22,
  },
  profileMeta: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  availabilityButton: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.white,
    borderWidth: 1,
    borderColor: RIDER_COLORS.white,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityButtonOn: {
    backgroundColor: '#E8F8E4',
    borderColor: '#E8F8E4',
  },
  availabilityText: {
    color: RIDER_COLORS.text,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  availabilityTextOn: {
    color: '#217C2A',
  },
  notice: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: RIDER_COLORS.soft,
    padding: 12,
    marginBottom: 10,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  metric: {
    flex: 1,
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricLabel: {
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    marginTop: 8,
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 21,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  sectionTitle: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
  },
  refreshButton: {
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.soft,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  listPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  orderCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: RIDER_COLORS.line,
  },
  orderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderImage: {
    width: 62,
    height: 62,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  orderImageFallback: {
    backgroundColor: RIDER_COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderTitleBlock: {
    flex: 1,
  },
  orderKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderKicker: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  orderTitle: {
    marginTop: 5,
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
    lineHeight: 19,
  },
  statusBadge: {
    minHeight: 22,
    borderRadius: 7,
    backgroundColor: RIDER_COLORS.soft,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 10,
  },
  orderMetaGrid: {
    marginTop: 11,
    flexDirection: 'row',
    gap: 8,
  },
  orderMeta: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderTotal: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.orange,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: RIDER_COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
  },

  // --- Brand cleanup overrides ---
  riderBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  riderBrandLogo: {
    width: 36,
    height: 36,
  },
  profilePanel: {
    minHeight: 104,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    overflow: 'hidden',
    marginBottom: 14,
  },
  profilePanelContent: {
    flex: 1,
    minHeight: 104,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: RIDER_COLORS.soft,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 20,
  },
  profileName: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 17,
    lineHeight: 21,
  },
  profileMeta: {
    marginTop: 4,
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  availabilityButton: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityButtonOn: {
    backgroundColor: RIDER_COLORS.soft,
    borderColor: '#FFDCC3',
  },
  availabilityTextOn: {
    color: RIDER_COLORS.orangeHot,
  },
  metric: {
    flex: 1,
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  listPanel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.orange,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Minimal rider polish ---
  screen: {
    flex: 1,
    backgroundColor: RIDER_COLORS.bg,
  },
  content: {
    paddingBottom: 30,
  },
  frame: {
    width: '100%',
    paddingHorizontal: 18,
    alignSelf: 'center',
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  riderBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  riderBrandLogo: {
    width: 34,
    height: 34,
  },
  kicker: {
    color: RIDER_COLORS.orangeHot,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  title: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 24,
    lineHeight: 29,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: RIDER_COLORS.white,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePanel: {
    minHeight: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    marginBottom: 12,
  },
  profilePanelContent: {
    flex: 1,
    minHeight: 96,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riderAvatar: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: RIDER_COLORS.soft,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: {
    color: RIDER_COLORS.orangeHot,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 20,
  },
  riderHeroText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 17,
    lineHeight: 21,
  },
  profileMeta: {
    marginTop: 3,
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  availabilityButton: {
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: RIDER_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  availabilityButtonOn: {
    backgroundColor: RIDER_COLORS.soft,
    borderColor: '#FFDCC3',
  },
  availabilityText: {
    color: RIDER_COLORS.text,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  availabilityTextOn: {
    color: RIDER_COLORS.orangeHot,
  },
  notice: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    backgroundColor: RIDER_COLORS.soft,
    padding: 12,
    marginBottom: 10,
  },
  noticeTitle: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  noticeText: {
    marginTop: 3,
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  rejectedNotice: {
    backgroundColor: '#FFF7F5',
    borderColor: '#F6C6C0',
  },
  reapplyForm: {
    marginTop: 12,
    gap: 11,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  textInput: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 12,
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
  },
  textArea: {
    minHeight: 70,
    paddingTop: 11,
    textAlignVertical: 'top',
  },
  licenseGrid: {
    flexDirection: 'row',
    gap: 9,
  },
  licenseButton: {
    flex: 1,
    minHeight: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FFDCC3',
    backgroundColor: RIDER_COLORS.soft,
    padding: 10,
    justifyContent: 'center',
    gap: 4,
  },
  licenseTitle: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  licenseText: {
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
  },
  successText: {
    color: '#2D6A33',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    marginBottom: 8,
  },
  errorText: {
    color: '#C12626',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    marginBottom: 8,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  metric: {
    flex: 1,
    minHeight: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: RIDER_COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricValue: {
    marginTop: 9,
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 19,
    lineHeight: 23,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
    lineHeight: 20,
  },
  refreshButton: {
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    backgroundColor: RIDER_COLORS.soft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  refreshText: {
    color: RIDER_COLORS.orangeHot,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  listPanel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.line,
    backgroundColor: RIDER_COLORS.white,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  orderCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: RIDER_COLORS.line,
  },
  orderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderImage: {
    width: 58,
    height: 58,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  orderImageFallback: {
    backgroundColor: RIDER_COLORS.soft,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  orderKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderKicker: {
    color: RIDER_COLORS.orangeHot,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  orderTitle: {
    marginTop: 4,
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
    lineHeight: 19,
  },
  statusBadge: {
    minHeight: 22,
    borderRadius: 7,
    backgroundColor: RIDER_COLORS.soft,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    color: RIDER_COLORS.orangeHot,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 10,
  },
  orderMetaGrid: {
    marginTop: 11,
    flexDirection: 'row',
    gap: 8,
  },
  orderMeta: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.surfaceMuted,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderMetaText: {
    flex: 1,
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  orderFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderTotalRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderTotal: {
    color: RIDER_COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: RIDER_COLORS.orange,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryButtonText: {
    color: RIDER_COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
  },
  emptyText: {
    color: RIDER_COLORS.muted,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 16,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  screen: {
    flex: 1,
    backgroundColor: RIDER_COLORS.white,
  },
  availabilityTextOn: {
    color: RIDER_COLORS.orange,
  },
  statusBadgeText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 10,
  },
  routePreviewBadgeText: {
    color: RIDER_COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
  },
});
