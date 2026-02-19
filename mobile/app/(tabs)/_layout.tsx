import { Drawer } from 'expo-router/drawer';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';

import { useThemeColors } from '@/context/theme';
import { AppDrawerContent } from '@/components/ui/drawer-content';

export default function AppLayout() {
  const colors = useThemeColors();
  return (
    <Drawer
      screenOptions={{
        headerShown: false,
        drawerActiveTintColor: '#fff',
        drawerInactiveTintColor: colors.text,
        drawerActiveBackgroundColor: colors.primary,
        drawerLabelStyle: { marginLeft: -12, fontWeight: '600', fontSize: 16 },
        drawerItemStyle: { borderRadius: 18, marginHorizontal: 6, marginVertical: 4 },
        drawerStyle: { backgroundColor: colors.background },
        sceneContainerStyle: { backgroundColor: colors.background },
      }}
      drawerContent={(props) => <AppDrawerContent {...props} />}>
      <Drawer.Screen
        name="index"
        options={{
          title: 'Dashboard',
          drawerIcon: ({ color }) => <MaterialIcons name="dashboard" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          drawerIcon: ({ color }) => <MaterialIcons name="list-alt" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="categories"
        options={{
          title: 'Categories',
          drawerIcon: ({ color }) => <MaterialIcons name="category" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="category-rules"
        options={{
          title: 'Category Rules',
          drawerIcon: ({ color }) => <MaterialIcons name="rule" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          drawerIcon: ({ color }) => <MaterialIcons name="credit-card" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          drawerIcon: ({ color }) => <MaterialIcons name="pie-chart" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="goals"
        options={{
          title: 'Goals',
          drawerIcon: ({ color }) => <MaterialIcons name="flag" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="reports"
        options={{
          title: 'Reports',
          drawerIcon: ({ color }) => <MaterialIcons name="bar-chart" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="debts"
        options={{
          title: 'Debts',
          drawerIcon: ({ color }) => <MaterialIcons name="payments" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          drawerIcon: ({ color }) => (
            <MaterialIcons name="currency-bitcoin" size={22} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          title: 'Profile',
          drawerIcon: ({ color }) => <MaterialIcons name="person" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          title: 'Settings',
          drawerIcon: ({ color }) => <MaterialIcons name="settings" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="more"
        options={{
          title: 'More',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="recurring"
        options={{
          title: 'Recurring',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="accounts/[id]"
        options={{
          title: 'Account Detail',
          drawerItemStyle: { display: 'none' },
        }}
      />
    </Drawer>
  );
}
