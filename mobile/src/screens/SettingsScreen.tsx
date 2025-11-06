import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

type RootStackParamList = {
  Home: undefined;
  Editor: undefined;
  Settings: undefined;
};

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const [autoSave, setAutoSave] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);
  const [darkMode, setDarkMode] = React.useState(true);

  const settings = [
    {
      title: 'Project Settings',
      items: [
        {
          label: 'Auto Save',
          value: autoSave,
          onValueChange: setAutoSave,
          type: 'switch',
        },
        {
          label: 'Default Project Resolution',
          value: '1920x1080',
          type: 'select',
        },
        {
          label: 'Default Frame Rate',
          value: '30 fps',
          type: 'select',
        },
      ],
    },
    {
      title: 'Editor Settings',
      items: [
        {
          label: 'Timeline Zoom Sensitivity',
          value: 'Medium',
          type: 'select',
        },
        {
          label: 'Show Grid Lines',
          value: true,
          type: 'switch',
        },
        {
          label: 'Snap to Grid',
          value: true,
          type: 'switch',
        },
      ],
    },
    {
      title: 'Performance',
      items: [
        {
          label: 'Hardware Acceleration',
          value: true,
          type: 'switch',
        },
        {
          label: 'Preview Quality',
          value: 'High',
          type: 'select',
        },
        {
          label: 'Cache Size',
          value: '512MB',
          type: 'select',
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          label: 'Push Notifications',
          value: notifications,
          onValueChange: setNotifications,
          type: 'switch',
        },
        {
          label: 'Export Complete Alerts',
          value: true,
          type: 'switch',
        },
        {
          label: 'Error Notifications',
          value: true,
          type: 'switch',
        },
      ],
    },
  ];

  const handleSelectOption = (title: string, value: string) => {
    Alert.alert(title, `Selected: ${value}`);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      {settings.map((section, sectionIndex) => (
        <View key={sectionIndex} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item, itemIndex) => (
            <View key={itemIndex} style={styles.settingItem}>
              <Text style={styles.settingLabel}>{item.label}</Text>
              {item.type === 'switch' ? (
                <Switch
                  value={item.value as boolean}
                  onValueChange={item.onValueChange}
                  trackColor={{ false: '#767577', true: '#3b82f6' }}
                  thumbColor={item.value ? '#f5dd4b' : '#f4f3f4'}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => handleSelectOption(item.label, item.value as string)}
                  style={styles.selectButton}>
                  <Text style={styles.selectText}>{item.value}</Text>
                  <Text style={styles.selectArrow}>▶</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>1.0.0</Text>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Platform</Text>
          <Text style={styles.settingValue}>React Native</Text>
        </View>
        <TouchableOpacity style={styles.aboutButton}>
          <Text style={styles.aboutButtonText}>View License</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#e2e8f0',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  placeholder: {
    width: 50,
  },
  section: {
    margin: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingLabel: {
    fontSize: 16,
    color: '#e2e8f0',
    flex: 1,
  },
  settingValue: {
    fontSize: 16,
    color: '#94a3b8',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectText: {
    fontSize: 16,
    color: '#94a3b8',
    marginRight: 8,
  },
  selectArrow: {
    fontSize: 12,
    color: '#64748b',
  },
  aboutButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    alignItems: 'center',
  },
  aboutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SettingsScreen;
