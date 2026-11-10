'use client';
/**
 * Client wrappers that connect the screens to their server actions and to the
 * router. Pages stay server components; this is the only place that knows
 * about both.
 */
import { useRouter } from 'next/navigation';
import { Estimator } from '@/components/prospectpv/admin/Estimator';
import { MapScreen } from '@/components/prospectpv/map/MapScreen';
import { NewLetterForm } from '@/components/prospectpv/admin/NewLetterForm';
import { PackagesManager } from '@/components/prospectpv/admin/PackagesManager';
import { SettingsPanels } from '@/components/prospectpv/admin/SettingsPanels';
import {
  createManualLetter, deletePackage, duplicatePackage, previewManualLetter, removeAsset, saveExtra, savePackage, saveSettingsSection, uploadAsset,
} from '@/lib/prospectpv/server/actions';
import { estimateArea, saveArea } from '@/lib/prospectpv/server/mapActions';

type Props<T extends (...a: never[]) => unknown> = Omit<Parameters<T>[0], 'actions' | 'onChanged' | 'onCreated'>;

export function NewLetterScreen(props: Props<typeof NewLetterForm>) {
  const router = useRouter();
  return <NewLetterForm {...props} actions={{ preview: previewManualLetter, create: createManualLetter }} onCreated={(id) => router.push(`/admin/sales/prospectpv/letters/${id}`)} />;
}

export function PackagesScreen(props: Props<typeof PackagesManager>) {
  const router = useRouter();
  return <PackagesManager {...props} actions={{ save: savePackage, remove: deletePackage, duplicate: duplicatePackage, saveExtra }} onChanged={() => router.refresh()} />;
}

export function EstimatorScreen(props: Props<typeof Estimator>) {
  const router = useRouter();
  return <Estimator {...props} actions={{ saveRates: (raw) => saveSettingsSection('scaffolding', raw) }} onChanged={() => router.refresh()} />;
}

export function SettingsScreen(props: Props<typeof SettingsPanels>) {
  const router = useRouter();
  return <SettingsPanels {...props} actions={{ saveSection: saveSettingsSection, upload: uploadAsset, remove: removeAsset }} onChanged={() => router.refresh()} />;
}

export function MapScreenClient(props: Omit<Parameters<typeof MapScreen>[0], 'actions'>) {
  return <MapScreen {...props} actions={{ estimate: estimateArea, save: saveArea }} />;
}
