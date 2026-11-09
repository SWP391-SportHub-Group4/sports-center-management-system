"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AsyncSection } from "@/components/ui";
import { catalogApi } from "@/features/catalog/api";
import {
  ServiceImageEditor,
  type ServiceImageOwner,
} from "@/features/manager/service-image-editor";
import type { ServiceImageKind } from "@/features/service-media";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { ManagerCourseDto } from "@/lib/types";

function ImageWorkspace({ kind, id }: { kind: ServiceImageKind; id: number }) {
  const state = useApi(
    async (signal): Promise<ServiceImageOwner> => {
      if (kind === "membership") {
        const item = (await catalogApi.packages(signal)).find(
          (item) => item.packageId === id,
        );
        if (!item) throw new Error("This membership plan could not be found.");
        return {
          name: item.name,
          price: item.price,
          description: item.description,
          backHref: "/manager/membership-plans",
        };
      }
      if (kind === "room") {
        const item = (await catalogApi.rooms(signal)).find(
          (item) => item.roomId === id,
        );
        if (!item) throw new Error("This room could not be found.");
        return { name: item.name, backHref: `/manager/facilities/${id}` };
      }
      const item = await api.get<ManagerCourseDto>(
        `/api/manager/classes/${id}`,
        { signal },
      );
      return {
        name: item.name,
        price: item.price,
        backHref: `/manager/classes/${id}`,
      };
    },
    [kind, id],
  );
  return (
    <AsyncSection state={state}>
      {(owner) => <ServiceImageEditor kind={kind} id={id} owner={owner} />}
    </AsyncSection>
  );
}

export default function Page() {
  const params = useParams<{ kind: string; id: string }>();
  const kind = params.kind;
  const id = Number(params.id);
  const valid =
    ["membership", "class", "room"].includes(kind) &&
    Number.isSafeInteger(id) &&
    id > 0;
  return (
    <AppShell
      title="Service images"
      allow={["CenterManager"]}
      operationalLayout
    >
      {valid ? (
        <ImageWorkspace kind={kind as ServiceImageKind} id={id} />
      ) : (
        <p role="alert">Choose a valid service to manage its images.</p>
      )}
    </AppShell>
  );
}
