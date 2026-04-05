import React from 'react';
import { Pressable, Text, View, ActivityIndicator } from 'react-native';

export function Button({ title, onPress, variant = 'primary', disabled, loading, icon }) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  
  const baseClasses = "flex-row items-center justify-center rounded-brand h-14 px-8";
  const primaryClasses = "bg-brand-orange";
  const outlineClasses = "bg-transparent border border-brand-peach";
  
  const containerClasses = `${baseClasses} ${isPrimary ? primaryClasses : ''} ${isOutline ? outlineClasses : ''} ${disabled ? 'opacity-50' : 'active:opacity-80'}`;
  
  const textBaseClasses = "font-brand text-lg font-semibold";
  const textPrimaryClasses = "text-brand-surface";
  const textOutlineClasses = "text-brand-orange";
  
  const textClasses = `${textBaseClasses} ${isPrimary ? textPrimaryClasses : ''} ${isOutline ? textOutlineClasses : ''}`;

  return (
    <Pressable 
      onPress={onPress} 
      disabled={disabled || loading} 
      className={containerClasses}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : '#F8964F'} />
      ) : (
        <>
          {icon && <View className={title ? "mr-2" : ""}>{icon}</View>}
          {title && <Text className={textClasses}>{title}</Text>}
        </>
      )}
    </Pressable>
  );
}
