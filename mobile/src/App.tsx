import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {Provider} from 'zustand/react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

// Import stores
import {videoStore} from './store/videoStore';

// Import screens
import HomeScreen from './screens/HomeScreen';
import EditorScreen from './screens/EditorScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createStackNavigator();

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        <Provider store={videoStore}>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Home"
              screenOptions={{
                headerStyle: {
                  backgroundColor: '#0f172a',
                },
                headerTintColor: '#e2e8f0',
                headerTitleStyle: {
                  fontWeight: 'bold',
                },
              }}>
              <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{title: 'Artone Editor'}}
              />
              <Stack.Screen
                name="Editor"
                component={EditorScreen}
                options={{
                  title: 'Video Editor',
                  headerLeft: null, // Disable back button in editor
                }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{title: 'Settings'}}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </Provider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default App;
