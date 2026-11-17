import { ExploreMapScreen } from '@/features/map/presentation/screens/ExploreMapScreen';

/** Explore map. On the web, Metro resolves the `.web.tsx` screen, which never loads react-native-maps. */
export default function MapRoute() {
  return <ExploreMapScreen />;
}
