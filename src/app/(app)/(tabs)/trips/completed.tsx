import { TripListScreen } from '@/features/trips/presentation/screens/TripListScreen';

export default function CompletedTripsRoute() {
  return <TripListScreen status="completed" />;
}
