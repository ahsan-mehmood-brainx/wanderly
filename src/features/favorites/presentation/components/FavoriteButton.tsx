import { useTranslation } from 'react-i18next';

import { AppButton, AppIconButton } from '@/shared/ui';

interface FavoriteButtonProps {
  readonly saved: boolean;
  /** Another change is being saved; a tap now would be refused. */
  readonly saving: boolean;
  readonly onPress: () => void;
  /** `icon` for a header, `button` for a sheet's actions. */
  readonly variant?: 'icon' | 'button';
}

/** Save/unsave toggle. Its label says the current state, "Save" or "Saved". */
export function FavoriteButton({ saved, saving, onPress, variant = 'icon' }: FavoriteButtonProps) {
  const { t } = useTranslation();
  const label = saved ? t('savedPlaces.saved') : t('savedPlaces.save');

  if (variant === 'button') {
    return (
      <AppButton
        label={label}
        leftIcon={saved ? 'favoriteFilled' : 'favorite'}
        variant={saved ? 'secondary' : 'outline'}
        disabled={saving}
        onPress={onPress}
      />
    );
  }
  return (
    <AppIconButton
      icon={saved ? 'favoriteFilled' : 'favorite'}
      color={saved ? 'primary' : 'text'}
      accessibilityLabel={label}
      accessibilityState={{ selected: saved, disabled: saving }}
      disabled={saving}
      onPress={onPress}
    />
  );
}
