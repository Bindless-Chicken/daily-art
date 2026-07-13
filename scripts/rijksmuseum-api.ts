import {Artwork} from "../src/types.ts";

const baseApiAdress: URL = new URL("https://data.rijksmuseum.nl/");

type ArtworkListResponse = {
    partOf?: {
        totalItems?: number;
    };
    orderedItems?: Array<{
        id?: string;
    }>;
    next?: {
        id?: string;
    };
};

type ArtworkSearchTerms = {
    page?: number;
    creator?: string;
    material?: string;
    technique?: string;
    creationDate?: string;
};


export async function queryArtworkCount(terms?: ArtworkSearchTerms): Promise<number> {
    const collectionUrl = new URL("search/collection", baseApiAdress);
    collectionUrl.searchParams.set("type", "painting");
    collectionUrl.searchParams.set("imageAvailable", "true");

    if (terms?.creator !== undefined) {
        collectionUrl.searchParams.set("creator", terms.creator);
    }
    if (terms?.material !== undefined) {
        collectionUrl.searchParams.set("material", terms.material);
    }
    if (terms?.technique !== undefined) {
        collectionUrl.searchParams.set("description", terms.technique);
    }
    if (terms?.creationDate !== undefined) {
        collectionUrl.searchParams.set("creationDate", terms.creationDate);
    }

    const response = await fetch(collectionUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum collection query failed: ${response.status} ${response.statusText}`);
    }

    const artworkList = (await response.json()) as ArtworkListResponse;

    return artworkList.partOf?.totalItems ?? 0;
}

async function queryArtworkListContinue(nextPageUrl: URL, targetPage: number, currentPage: number): Promise<ArtworkListResponse> {
    console.debug(`Requesting page ${currentPage}/${targetPage}`);
    const response = await fetch(nextPageUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum collection query failed: ${response.status} ${response.statusText}`);
    }

    let artworkList = (await response.json()) as ArtworkListResponse;

    if( targetPage !== currentPage && artworkList.next?.id !== undefined ) {
        artworkList = await queryArtworkListContinue(new URL(artworkList.next.id), targetPage, currentPage + 1);
    }

    return artworkList;
}

export async function queryArtworkList(terms?: ArtworkSearchTerms): Promise<string[]> {
  const collectionUrl = new URL("search/collection", baseApiAdress);
  collectionUrl.searchParams.set("type", "painting");
  collectionUrl.searchParams.set("imageAvailable", "true");

  if (terms?.creator !== undefined) {
      collectionUrl.searchParams.set("creator", terms.creator);
  }
  if (terms?.material !== undefined) {
      collectionUrl.searchParams.set("material", terms.material);
  }
  if (terms?.technique !== undefined) {
      collectionUrl.searchParams.set("description", terms.technique);
  }
  if (terms?.creationDate !== undefined) {
      collectionUrl.searchParams.set("creationDate", terms.creationDate);
  }

  const response = await fetch(collectionUrl);
  if (!response.ok) {
    throw new Error(`Rijksmuseum collection query failed: ${response.status} ${response.statusText}`);
  }

  let artworkList = (await response.json()) as ArtworkListResponse;

  if( terms?.page !== undefined && terms?.page !== 0 && artworkList.next?.id !== undefined ) {
      artworkList = await queryArtworkListContinue(new URL(artworkList.next.id), terms.page, 1);
  }

  return (
    artworkList.orderedItems
      ?.map((item) => (typeof item.id === "string" ? item.id.match(/\/(\d+)$/)?.[1] : undefined))
      .filter((id): id is string => id !== undefined) ?? []
  );
}

type ArtworkDataResponse = {
    produced_by?: {
        referred_to_by?: Array<{
            content?: string;
            classified_as?: Array<{
                id?: string;
            }>;
            language?: Array<{
                id?: string;
            }>;
        }>;
        timespan?: {
            identified_by?: Array<{
                content?: string;
                language?: Array<{
                    id?: string;
                }>;
            }>;
        };
    };
    identified_by?: Array<{
        id?: string;
        type?: string;
        content?: string;
        classified_as?: Array<{
            id?: string;
        }>;
        language?: Array<{
            id?: string;
        }>;
    }>;
    referred_to_by?: Array<{
        content?: string;
        classified_as?: Array<{
            id?: string;
        }>;
        language?: Array<{
            id?: string;
        }>;
    }>;
    shows?: Array<{
        id?: string;
        type?: string;
    }>;
    subject_of?: Array<{
        part?: Array<{
            content?: string;
            classified_as?: Array<{
                id?: string;
            }>;
        }>;
        language?: Array<{
            id?: string;
        }>;
    }>;
};

function getName(artwork: ArtworkDataResponse): string|undefined {
    let name;

    // First try to find the repository name in English
    name = artwork.identified_by?.find((entry) => {
        return entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300417200" && entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.content;
    if (name !== undefined) {
        return name;
    }

    // Next, try to find the exhibit title in English
    name = artwork.identified_by?.find((entry) => {
        return entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300417207" && entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.content;
    if (name !== undefined) {
        return name;
    }

    // If we really cannot find it, return the repository, exhibit title, or preferred title in whatever language we can find
    name = artwork.identified_by?.find((entry) => {
        return entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300417207"
            || entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300417200"
            || entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300404670";
    })?.content;
    if (name !== undefined) {
        return name;
    }

    return undefined;
}

function getMaterial(artwork: ArtworkDataResponse): string {
    return artwork.referred_to_by?.find((entry) => {
        return entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300435429" && entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.content ?? "undefined";
}

function getDimensions(artwork: ArtworkDataResponse): string {
    return artwork.referred_to_by?.find((entry) => {
        return entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300435430" && entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.content ?? "undefined";
}

function getArtist(artwork: ArtworkDataResponse): string {
    return artwork.produced_by?.referred_to_by?.find((entry) => {
        return entry.classified_as?.[0].id === "http://vocab.getty.edu/aat/300435416" && entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.content ?? "undefined";
}

function getExhibitScript(artwork: ArtworkDataResponse): string {
    return artwork.subject_of?.find((entry) => {
        return entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.part?.find((part) => {
        return part.classified_as?.some((classification) => classification.id === "http://vocab.getty.edu/aat/300048722");
    })?.content ?? "undefined";
}

function getTimespan(artwork: ArtworkDataResponse): string {
    return artwork.produced_by?.timespan?.identified_by?.find((entry) => {
        return entry.language?.[0].id === "http://vocab.getty.edu/aat/300388277";
    })?.content ?? "undefined";
}

export async function queryArtwork(id: string): Promise<Artwork> {
    const artworkUrl = new URL(id, baseApiAdress);

    const response = await fetch(artworkUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum artwork (${artworkUrl}) query failed: ${response.status} ${response.statusText}`);
    }

    const artworkData = (await response.json()) as ArtworkDataResponse;

    return {
        id,
        name: getName(artworkData) ?? "",
        timespan: getTimespan(artworkData),
        artist: getArtist(artworkData),
        material: getMaterial(artworkData),
        dimensions: getDimensions(artworkData),
        exhibitScript: getExhibitScript(artworkData),
        imageUrl: (await retrieveArtworkUrl(artworkData)).toString(),
    }
}

type ArtworkVisualItemResponse = {
    digitally_shown_by?: Array<{
        id?: string;
        type?: string;
    }>;
};

type ArtworkDigitalObjectResponse = {
    access_point?: Array<{
        id?: string;
        type?: string;
    }>;
};

function retrieveResourceId(resourceUrl: string | undefined, resourceName: string): string {
    const resourceId = resourceUrl?.match(/\/(\d+)$/)?.[1];
    if (resourceId === undefined) {
        throw new Error(`Rijksmuseum artwork is missing ${resourceName}`);
    }

    return resourceId;
}

async function retrieveArtworkUrl(artwork: ArtworkDataResponse): Promise<URL> {
    const visualItem: string = retrieveResourceId(artwork.shows?.[0].id, "visual item");
    const visualItemUrl = new URL(visualItem, baseApiAdress);
    const response = await fetch(visualItemUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum visual item query failed: ${response.status} ${response.statusText}`);
    }

    const visualItemData = (await response.json()) as ArtworkVisualItemResponse;

    const digitalObject: string = retrieveResourceId(visualItemData.digitally_shown_by?.[0].id, "digital object");
    const digitalObjectUrl = new URL(digitalObject, baseApiAdress);
    const response2 = await fetch(digitalObjectUrl);
    if (!response2.ok) {
        throw new Error(`Rijksmuseum digital object query failed: ${response2.status} ${response2.statusText}`);
    }

    const digitalObjectData = (await response2.json()) as ArtworkDigitalObjectResponse;

    const accessPoint = digitalObjectData.access_point?.[0].id;
    if (accessPoint === undefined) {
        throw new Error("Rijksmuseum digital object is missing an access point");
    }

    return new URL(accessPoint);
}
