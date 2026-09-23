import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { LegalDocument } from "@prisma/client";
import { LegalDocumentsService, kindFromSlug } from "./legal-documents.service";

function present(document: LegalDocument, upcoming: LegalDocument | null) {
  return {
    kind: document.kind,
    version: document.version,
    title: document.title,
    body: document.body,
    sha256: document.sha256,
    effectiveAt: document.effectiveAt,
    upcoming: upcoming ? { version: upcoming.version, title: upcoming.title, effectiveAt: upcoming.effectiveAt } : null,
  };
}

/** Public: anyone may read pagosYa's terms, the one in force or any past version. */
@ApiTags("legal")
@Controller("v1/legal")
export class LegalController {
  constructor(private readonly legal: LegalDocumentsService) {}

  @Get(":kind")
  async current(@Param("kind") slug: string) {
    const kind = kindFromSlug(slug);
    const [current, upcoming] = await Promise.all([this.legal.current(kind), this.legal.upcoming(kind)]);
    if (!current) throw new NotFoundException("Aún no hay un documento vigente");
    return present(current, upcoming);
  }

  @Get(":kind/:version")
  async version(@Param("kind") slug: string, @Param("version") version: string) {
    return present(await this.legal.getVersion(kindFromSlug(slug), version), null);
  }
}
