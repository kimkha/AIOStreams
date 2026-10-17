import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FaFileExport, FaFileImport } from 'react-icons/fa';
import { toast } from 'sonner';
import type { UserData } from '@aiostreams/core';
import { Button } from '@aiostreams/ui/button';
import { useDisclosure } from '@aiostreams/ui/hooks/disclosure';
import { NumberInput } from '@aiostreams/ui/number-input';
import { Select } from '@aiostreams/ui/select';
import { Slider } from '@aiostreams/ui/slider';
import { Switch } from '@aiostreams/ui/switch';
import { useStatus } from '@/context/status';
import { useUserData } from '@/context/userData';
import {
  uploadCustomRatings,
  type Credentials,
  type CustomRatings,
} from '@/lib/api';
import { CUSTOM_RATINGS_QUERY_ROOT, customRatingsQuery } from '@/lib/queries';
import {
  RATING_SCALES,
  RATING_SOURCES,
} from '../../../../../../core/src/utils/constants';
import { ImportModal } from '../../../shared/import-modal';
import { SettingsCard } from '../../../shared/settings-card';
import { downloadJson } from './filter-inputs';

type RatingFilter = NonNullable<UserData['ratingFilter']>;

export function RatingFilterSettings() {
  const { userData, setUserData } = useUserData();
  const { status } = useStatus();
  const filter = userData.ratingFilter;
  const isEnabled = filter?.enabled ?? false;
  const source = filter?.source ?? 'custom';
  const scale = RATING_SCALES[source];
  const [min, max] = filter?.range ?? [0, scale.max];
  const isImdbAvailable =
    status?.settings.metadata.imdbRatings.enabled ?? false;
  const update = (patch: Partial<RatingFilter>) =>
    setUserData((prev) => ({
      ...prev,
      ratingFilter: { ...prev.ratingFilter, ...patch },
    }));

  return (
    <div className="space-y-4">
      <SettingsCard
        id="ratingFilter"
        title="Rating Range"
        description="Keep only titles rated inside the range. A title outside it disappears from catalogs and returns no streams. Titles without a rating are always kept."
      >
        <Switch
          label="Enabled"
          side="right"
          value={isEnabled}
          onValueChange={(enabled) => update({ enabled })}
        />
        <Select
          disabled={!isEnabled}
          label="Rating source"
          options={[
            { label: 'Custom ratings (0–100)', value: 'custom' },
            {
              label: 'IMDb (0–10)',
              value: 'imdb',
              disabled: !isImdbAvailable,
            },
          ]}
          value={source}
          help={
            isImdbAvailable
              ? undefined
              : 'IMDb ratings need IMDB_RATINGS_ENABLED=true on this instance.'
          }
          onValueChange={(value) => {
            const next = RATING_SOURCES.find((option) => option === value);
            if (!next || next === source) return;
            update({ source: next, range: [0, RATING_SCALES[next].max] });
          }}
        />
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <Slider
              disabled={!isEnabled}
              label="Rating range"
              min={0}
              max={scale.max}
              step={scale.step}
              value={[min, max]}
              onValueChange={([nextMin, nextMax]) => {
                if (nextMin === undefined || nextMax === undefined) return;
                update({ range: [nextMin, nextMax] });
              }}
            />
            <div className="flex justify-between mt-1 text-xs text-[--muted]">
              <span>{min}</span>
              <span>{max}</span>
            </div>
          </div>
          <div className="flex gap-2 md:w-[240px] shrink-0">
            <NumberInput
              label="Min"
              disabled={!isEnabled}
              min={0}
              max={max}
              step={scale.step}
              value={min}
              onValueChange={(value) => {
                if (Number.isFinite(value)) update({ range: [value, max] });
              }}
            />
            <NumberInput
              label="Max"
              disabled={!isEnabled}
              min={min}
              max={scale.max}
              step={scale.step}
              value={max}
              onValueChange={(value) => {
                if (Number.isFinite(value)) update({ range: [min, value] });
              }}
            />
          </div>
        </div>
        {source === 'imdb' && (
          <NumberInput
            label="Minimum votes"
            help="Titles with fewer IMDb votes are hidden too."
            disabled={!isEnabled}
            min={0}
            step={100}
            value={filter?.minVotes ?? 0}
            onValueChange={(minVotes) => {
              if (Number.isFinite(minVotes)) update({ minVotes });
            }}
          />
        )}
      </SettingsCard>
      <CustomRatingsCard />
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getRatingSummary(
  credentials: Credentials | null,
  ratings: CustomRatings | undefined,
  error: unknown
): string {
  if (!credentials) return 'Save this configuration before uploading ratings.';
  if (error) return errorMessage(error, 'Could not load the custom ratings.');
  if (!ratings) return 'Loading…';
  if (ratings.count === 0) return 'No ratings uploaded yet.';
  return `${ratings.count.toLocaleString()} titles rated.`;
}

function CustomRatingsCard() {
  const { uuid, password } = useUserData();
  const credentials = uuid ? { uuid, password } : null;
  const queryClient = useQueryClient();
  const { data, error } = useQuery(customRatingsQuery(credentials));
  const importModal = useDisclosure(false);

  const onDownload = async () => {
    if (!credentials) return;
    try {
      const latest = await queryClient.fetchQuery({
        ...customRatingsQuery(credentials),
        staleTime: 0,
      });
      downloadJson(
        { titles: latest.titles },
        `custom-ratings-${credentials.uuid.slice(0, 8)}.json`
      );
    } catch (downloadError) {
      toast.error(
        errorMessage(downloadError, 'Could not download the custom ratings')
      );
    }
  };

  const onUpload = async (json: unknown) => {
    if (!credentials) return;
    try {
      const { count } = await uploadCustomRatings(
        credentials,
        JSON.stringify(json)
      );
      toast.success(`Uploaded ${count.toLocaleString()} custom ratings`);
    } catch (uploadError) {
      toast.error(
        errorMessage(uploadError, 'Could not upload the custom ratings')
      );
    } finally {
      void queryClient.invalidateQueries({
        queryKey: CUSTOM_RATINGS_QUERY_ROOT,
      });
    }
  };

  return (
    <SettingsCard
      id="customRatings"
      title="Custom Ratings"
      description='Your own ratings, as a JSON file like { "titles": { "tt0111161": { "rating": 12, "type": "movie", "name": "The Shawshank Redemption", "year": "1994" } } } with ratings from 0 to 100. Titles with a type also fill the Filtered Catalog addon. Uploading replaces every title and applies immediately, without saving.'
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[--muted] mr-auto">
          {getRatingSummary(credentials, data, error)}
        </p>
        <Button
          size="sm"
          intent="primary-subtle"
          leftIcon={<FaFileExport />}
          disabled={!data?.count}
          onClick={() => void onDownload()}
        >
          Download JSON
        </Button>
        <Button
          size="sm"
          intent="primary-subtle"
          leftIcon={<FaFileImport />}
          disabled={!credentials}
          onClick={importModal.open}
        >
          Upload JSON
        </Button>
      </div>
      <ImportModal
        open={importModal.isOpen}
        onOpenChange={importModal.toggle}
        onImport={(json) => void onUpload(json)}
      />
    </SettingsCard>
  );
}
