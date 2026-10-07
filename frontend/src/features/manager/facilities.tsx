"use client";
import { useLanguage } from "@/lib/language";
import { useUrlQuery, choiceQuery } from "@/lib/useUrlQuery";
import { Tabs } from "@/components/primitives";
import { RoomsManager } from "@/features/catalog";
import { RoomTypesManager } from "@/features/catalog";
export function Facilities() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { tab: "rooms" },
    { tab: choiceQuery(["rooms", "types"], "rooms") },
  );
  return (
    <Tabs
      ariaLabel={t.managerOperations.facilities}
      value={values.tab}
      onChange={(tab) => setValues({ tab })}
      tabs={[
        { id: "rooms", label: t.operations.room },
        { id: "types", label: t.managerOperations.roomTypes },
      ]}
    >
      {values.tab === "rooms" ? <RoomsManager /> : <RoomTypesManager />}
    </Tabs>
  );
}
