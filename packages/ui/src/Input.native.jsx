import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Outfit_600SemiBold',
    color: '#333232',
    paddingLeft: 2,
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F4E5D8',
    borderWidth: 2,
    borderColor: '#E7D8CA',
    borderRadius: 15,
    paddingHorizontal: 14,
  },
  fieldFocused: {
    borderColor: '#F8964F',
  },
  input: {
    flex: 1,
    color: '#1E1E1E',
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    paddingVertical: 10,
  },
  prefix: {
    color: '#5E5E5E',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
  },
  error: {
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
    color: '#D32F2F',
  },
  disabled: {
    opacity: 0.65,
  },
});

function getKeyboardType({ inputMode, type }) {
  if (inputMode === 'numeric') {
    return 'number-pad';
  }

  if (inputMode === 'tel' || type === 'tel') {
    return 'phone-pad';
  }

  if (type === 'email') {
    return 'email-address';
  }

  if (type === 'date') {
    return 'numbers-and-punctuation';
  }

  return 'default';
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  onChangeText,
  type = 'text',
  error,
  prefix,
  prefixStyle,
  suffix,
  disabled = false,
  autoFocus = false,
  maxLength,
  inputMode,
  className,
  style,
  inputStyle: inputStyleOverride,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const keyboardType = useMemo(
    () => getKeyboardType({ inputMode, type }),
    [inputMode, type],
  );

  const handleChangeText = (nextValue) => {
    onChangeText?.(nextValue);
    onChange?.({
      target: {
        value: nextValue,
      },
    });
  };

  return (
    <View style={styles.container} className={className}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View
        style={[
          styles.field,
          isFocused && styles.fieldFocused,
          disabled && styles.disabled,
          style,
        ]}
      >
        {prefix ? <Text style={[styles.prefix, prefixStyle]}>{prefix}</Text> : null}

        <TextInput
          placeholder={placeholder}
          placeholderTextColor="#8E8781"
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          keyboardType={keyboardType}
          editable={!disabled}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoCorrect={false}
          autoCapitalize={type === 'email' ? 'none' : 'words'}
          style={[styles.input, inputStyleOverride]}
        />

        {suffix}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
