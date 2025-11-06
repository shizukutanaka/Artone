import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useVideoStore} from '../store/videoStore';
import {useElectronAPI} from '../hooks/useElectronAPI';

type RootStackParamList = {
  Home: undefined;
  Editor: undefined;
  Settings: undefined;
  MediaLibrary: undefined;
};

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

const {width, height} = Dimensions.get('window');

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const {projects, currentProject, createProject, loadProject, deleteProject} = useVideoStore();
  const {isElectron, showOpenDialog, showSaveDialog, showNotification} = useElectronAPI();

  const handleNewProject = () => {
    createProject('Untitled Project');
    navigation.navigate('Editor');
  };

  const handleOpenProject = async () => {
    if (isElectron) {
      try {
        const result = await showOpenDialog({
          properties: ['openFile'],
          filters: [
            {name: 'Artone Project', extensions: ['json']},
          ],
        });

        if (!result.canceled && result.filePaths.length > 0) {
          await loadProject(result.filePaths[0]);
          showNotification({
            title: 'Project Opened',
            body: 'Project loaded successfully',
          });
          navigation.navigate('Editor');
        }
      } catch (error) {
        showNotification({
          title: 'Open Failed',
          body: 'Failed to open project',
        });
      }
    } else {
      Alert.alert('Feature', 'Open project functionality will be implemented');
    }
  };

  const handleSaveProject = async () => {
    if (!currentProject) return;

    if (isElectron) {
      try {
        const result = await showSaveDialog({
          defaultPath: `${currentProject.name}.json`,
          filters: [
            {name: 'Artone Project', extensions: ['json']},
          ],
        });

        if (!result.canceled && result.filePath) {
          // 実際の保存処理を実装
          showNotification({
            title: 'Project Saved',
            body: 'Project saved successfully',
          });
        }
      } catch (error) {
        showNotification({
          title: 'Save Failed',
          body: 'Failed to save project',
        });
      }
    } else {
      Alert.alert('Save', 'Save functionality implemented');
    }
  };

  const handleOpenMediaLibrary = () => {
    navigation.navigate('MediaLibrary');
  };

  const features = [
    {
      title: 'Multi-Track Timeline',
      description: 'Professional multi-track video editing',
      icon: '🎬',
    },
    {
      title: 'AI-Powered Editing',
      description: 'Smart cuts and effects powered by AI',
      icon: '🤖',
    },
    {
      title: 'Real-time Preview',
      description: 'Instant preview of your edits',
      icon: '⚡',
    },
    {
      title: 'Cross-Platform',
      description: 'Works on mobile and desktop',
      icon: '📱',
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Artone Video Editor</Text>
        <Text style={styles.subtitle}>Professional Mobile Video Editing</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleNewProject}>
          <Text style={styles.primaryButtonText}>New Project</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenProject}>
          <Text style={styles.secondaryButtonText}>Open Project</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.mediaButton} onPress={handleOpenMediaLibrary}>
          <Text style={styles.mediaButtonText}>Media Library</Text>
        </TouchableOpacity>
      </View>

      {/* 現在のプロジェクト */}
      {currentProject && (
        <View style={styles.currentProject}>
          <Text style={styles.sectionTitle}>Current Project</Text>
          <View style={styles.projectCard}>
            <Text style={styles.projectName}>{currentProject.name}</Text>
            <Text style={styles.projectDetails}>
              {currentProject.tracks.length} tracks • {currentProject.clips.length} clips
            </Text>
            <TouchableOpacity onPress={handleSaveProject} style={styles.saveButton}>
              <Text style={styles.saveButtonText}>Save Project</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 最近のプロジェクト */}
      {projects.length > 0 && (
        <View style={styles.recentProjects}>
          <Text style={styles.sectionTitle}>Recent Projects</Text>
          {projects.slice(0, 3).map(project => (
            <TouchableOpacity key={project.id} style={styles.projectItem}>
              <Text style={styles.projectItemName}>{project.name}</Text>
              <Text style={styles.projectItemDetails}>
                {project.tracks.length} tracks • {project.clips.length} clips
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.features}>
        {features.map((feature, index) => (
          <View key={index} style={styles.featureCard}>
            <Text style={styles.featureIcon}>{feature.icon}</Text>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureDescription}>{feature.description}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Built with React Native</Text>
        <Text style={styles.footerVersion}>Version 1.0.0</Text>
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
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },
  actions: {
    padding: 24,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#475569',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  mediaButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  mediaButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  currentProject: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 12,
  },
  projectCard: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  projectDetails: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#475569',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  saveButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  recentProjects: {
    padding: 24,
  },
  projectItem: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projectItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  projectItemDetails: {
    color: '#94a3b8',
    fontSize: 12,
  },
  features: {
    padding: 24,
    gap: 16,
  },
  featureCard: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginTop: 32,
  },
  footerText: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 4,
  },
  footerVersion: {
    color: '#475569',
    fontSize: 12,
  },
});

export default HomeScreen;
