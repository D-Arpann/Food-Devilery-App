import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  error,
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className="w-full">
      {label && (
        <Text className="font-brand text-main mb-2 text-base font-medium">
          {label}
        </Text>
      )}
      <TextInput
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholderTextColor="#5E5E5E"
        className={`font-brand text-main bg-brand-surface border rounded-brand p-4 text-base ${
          isFocused ? 'border-brand-orange' : 'border-brand-peach'
        }`}
      />
      {error && (
        <Text className="font-brand text-red-500 mt-1 text-sm">
          {error}
        </Text>
      )}
    </View>
  );
}
