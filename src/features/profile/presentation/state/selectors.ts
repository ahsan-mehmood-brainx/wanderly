import { type RootState } from '@/core/store/store';

export const selectLocalProfile = (state: RootState) => state.profile.profile;
export const selectLocalProfileStatus = (state: RootState) => state.profile.status;
export const selectLocalProfileErrorKind = (state: RootState) => state.profile.errorKind;
export const selectLocalProfileSaving = (state: RootState) => state.profile.changeRequestId !== null;
