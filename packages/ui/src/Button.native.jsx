import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 15,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: {
    transform: [{ translateY: -1 }],
  },
  disabled: {
    opacity: 0.65,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
  },
  textOutline: {
    color: '#1E1E1E',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

const variants = {
  primary: {
    backgroundColor: '#F8964F',
    borderColor: '#F8964F',
  },
  outline: {
    backgroundColor: '#FFFFFF',
    borderColor: '#1E1E1E',
  },
};

export function Button({
  title,
  children,
  onPress,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  className,
  style,
  textStyle,
  leftIcon,
}) {
  const isDisabled = disabled || loading;
  const activeVariant = variants[variant] || variants.primary;
  const color = variant === 'outline' ? '#1E1E1E' : '#FFFFFF';
  const hasCustomChildren = children && typeof children !== 'string';
  const label = title || (typeof children === 'string' ? children : '');

  const labelNode = (
    <Text style={[styles.text, variant === 'outline' && styles.textOutline, textStyle]}>
      {label}
    </Text>
  );

  const content = hasCustomChildren ? children : (
    leftIcon ? (
      <View style={styles.contentRow}>
        {leftIcon}
        {labelNode}
      </View>
    ) : labelNode
  );

  return (
    <Pressable
      onPress={onPress || onClick}
      disabled={isDisabled}
      className={className}
      style={({ pressed }) => [
        styles.base,
        activeVariant,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={color} />
          <Text style={[styles.text, variant === 'outline' && styles.textOutline, textStyle]}>
            {title || 'Please wait...'}
          </Text>
        </View>
      ) : (
        content
      )}
    </Pressable>
  );
}
