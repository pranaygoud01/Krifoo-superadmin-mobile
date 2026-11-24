/** Floor reports now live in Analytics (Tables & floor tab); old links land there. */
import { Redirect } from 'expo-router';

export default function FloorReportsRedirect() {
  return <Redirect href={{ pathname: '/analytics', params: { tab: 'tables' } }} />;
}
