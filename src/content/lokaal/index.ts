import { kettlebellTraining } from "./kettlebell-training";
import { krachttraining } from "./krachttraining";
import { mobility } from "./mobility";
import { personalTraining } from "./personal-training";
import { personalTrainerBussum } from "./personal-trainer-bussum";
import { personalTrainerGooi } from "./personal-trainer-gooi";
import { personalTrainerHilversum } from "./personal-trainer-hilversum";
import { personalTrainerLaren } from "./personal-trainer-laren";
import type {
  DienstPagina,
  DienstSlug,
  HubPagina,
  LocatiePagina,
  LocatieSlug,
} from "./types";

export * from "./types";

/**
 * Register van de acht pagina's. Een pagina op 'live' zetten is een typefout als
 * een verplicht veld ontbreekt (zie types.ts), dus de build breekt dan.
 */
export const LOKALE_PAGINAS: { [K in DienstSlug]: DienstPagina } & {
  [K in LocatieSlug]: LocatiePagina;
} & { "personal-trainer-gooi": HubPagina } = {
  "personal-training": personalTraining,
  "kettlebell-training": kettlebellTraining,
  mobility,
  krachttraining,
  "personal-trainer-hilversum": personalTrainerHilversum,
  "personal-trainer-bussum": personalTrainerBussum,
  "personal-trainer-laren": personalTrainerLaren,
  "personal-trainer-gooi": personalTrainerGooi,
};
