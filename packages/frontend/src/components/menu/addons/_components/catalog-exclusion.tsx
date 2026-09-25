import React from 'react';
import { useUserData } from '@/context/userData';
import { TextInputs } from '../../filters/_components/filter-inputs';

export function CatalogExclusionCard() {
  const { userData, setUserData } = useUserData();

  return (
    <>
      <TextInputs
        fieldName="excludedCatalogIds"
        itemName="ID"
        label="Excluded Catalog IDs"
        help="Hide catalog titles whose id or IMDb id is in this list."
        values={userData.excludedCatalogIds ?? []}
        onValuesChange={(excludedCatalogIds) =>
          setUserData((prev) => ({ ...prev, excludedCatalogIds }))
        }
        placeholder="tt0111161"
      />
      <TextInputs
        fieldName="syncedExcludedCatalogIdUrls"
        itemName="URL"
        label="Synced Excluded Catalog ID URLs"
        help="HTTP(S) URLs that return a JSON list or newline-separated IDs. Fetched when catalogs load."
        values={userData.syncedExcludedCatalogIdUrls ?? []}
        onValuesChange={(syncedExcludedCatalogIdUrls) =>
          setUserData((prev) => ({ ...prev, syncedExcludedCatalogIdUrls }))
        }
        placeholder="https://example.com/excluded-ids.json"
      />
    </>
  );
}
