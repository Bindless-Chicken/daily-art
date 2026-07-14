import {Artwork} from "../src/types.ts";

const baseApiAdress: URL = new URL("https://data.rijksmuseum.nl/");

type OneOrMany<T> = T | T[];

function asArray<T>(value: OneOrMany<T> | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

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
    title?: string;
    creator?: string;
    material?: string;
    technique?: string;
    creationDate?: string;
};

type ArtworkTagResponse = {
    identified_by?: Array<{
        type?: string;
        content?: string;
        language?: Array<{
            id?: string;
        }>;
    }>;
};


export async function queryArtworkCount(terms?: ArtworkSearchTerms): Promise<number> {
    const collectionUrl = new URL("search/collection", baseApiAdress);
    collectionUrl.searchParams.set("type", "painting");
    collectionUrl.searchParams.set("imageAvailable", "true");

    if (terms?.title !== undefined) {
        collectionUrl.searchParams.set("title", terms.title);
    }
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

// https://data.rijksmuseum.nl/search/collection?description=(story of) Venus (Aphrodite)&type=painting&imageAvailable=true

async function queryArtworkListContinue(nextPageUrl: URL, targetPage: number, currentPage: number): Promise<ArtworkListResponse> {
    console.debug(`Requesting page ${currentPage}/${targetPage}`);
    const response = await fetch(nextPageUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum collection query failed: ${response.status} ${response.statusText}`);
    }

    let artworkList = (await response.json()) as ArtworkListResponse;

    if (targetPage !== currentPage && artworkList.next?.id !== undefined) {
        artworkList = await queryArtworkListContinue(new URL(artworkList.next.id), targetPage, currentPage + 1);
    }

    return artworkList;
}

export async function queryArtworkList(terms?: ArtworkSearchTerms): Promise<string[]> {
    const collectionUrl = new URL("search/collection", baseApiAdress);
    collectionUrl.searchParams.set("type", "painting");
    collectionUrl.searchParams.set("imageAvailable", "true");

    if (terms?.title !== undefined) {
        collectionUrl.searchParams.set("title", terms.title);
    }
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

    if (terms?.page !== undefined && terms?.page !== 0 && artworkList.next?.id !== undefined) {
        artworkList = await queryArtworkListContinue(new URL(artworkList.next.id), terms.page, 1);
    }

    return (
        artworkList.orderedItems
            ?.map((item) => (typeof item.id === "string" ? item.id.match(/\/(\d+)$/)?.[1] : undefined))
            .filter((id): id is string => id !== undefined) ?? []
    );
}

export async function queryArtworkListByTag(tagId: string): Promise<string[]> {
    const tagUrl = new URL(tagId, "https://id.rijksmuseum.nl/");
    const response = await fetch(tagUrl, {
        headers: {
            Accept: "text/html",
        },
    });
    if (!response.ok) {
        throw new Error(`Rijksmuseum tag (${tagUrl}) query failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const nuxtData = html.match(/<script[^>]*\bid=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (nuxtData === undefined) {
        throw new Error(`Rijksmuseum tag (${tagUrl}) response is missing __NUXT_DATA__`);
    }

    const decodedNuxtData = nuxtData.replaceAll("\\u002F", "/");
    const artworkUrls = decodedNuxtData.match(/https:\/\/(?:data|id)\.rijksmuseum\.nl\/\d+/g) ?? [];

    return [...new Set(artworkUrls.map((url) => retrieveResourceId(url, "artwork")))];
}

export async function queryArtworkTagLabel(tagId: string): Promise<string> {
    const tagUrl = new URL(tagId, "https://id.rijksmuseum.nl/");
    const response = await fetch(tagUrl, {
        headers: {
            Accept: "application/ld+json, application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Rijksmuseum tag (${tagUrl}) query failed: ${response.status} ${response.statusText}`);
    }

    const tag = (await response.json()) as ArtworkTagResponse;
    const names = tag.identified_by?.filter((entry) => entry.type === "Name" && entry.content !== undefined) ?? [];
    const englishName = names.find((entry) =>
        entry.language?.some((language) => language.id === "http://vocab.getty.edu/aat/300388277")
    );
    const label = englishName?.content ?? names[0]?.content;
    if (label === undefined) {
        throw new Error(`Rijksmuseum tag (${tagUrl}) is missing a name`);
    }

    return label;
}

type ArtworkDataResponse = {
    classified_as?: Array<{
        notation?: OneOrMany<{
            "@language"?: string;
            "@value"?: string;
        }>;
        equivalent?: OneOrMany<{
            id?: string;
        }>;
    }>;
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

function getName(artwork: ArtworkDataResponse): string | undefined {
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

export type ArtworkSelectionMetadata = {
    isPainting: boolean;
    year?: number;
};

export async function queryArtworkSelectionMetadata(id: string): Promise<ArtworkSelectionMetadata> {
    const artworkUrl = new URL(id, baseApiAdress);
    const response = await fetch(artworkUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum artwork (${artworkUrl}) query failed: ${response.status} ${response.statusText}`);
    }

    const artworkData = (await response.json()) as ArtworkDataResponse;
    const yearText = getTimespan(artworkData).match(/\b\d{3,4}\b/)?.[0];
    const isPainting = artworkData.classified_as?.some((classification) =>
        asArray(classification.equivalent).some((equivalent) =>
            equivalent.id === "http://vocab.getty.edu/aat/300033618"
        ) || asArray(classification.notation).some((notation) =>
            notation["@language"] === "en" && notation["@value"]?.toLowerCase() === "painting"
        )
    ) ?? false;

    return {
        isPainting,
        year: yearText === undefined ? undefined : Number.parseInt(yearText, 10),
    };
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
        tags: (await retrieveArtworkTags(artworkData)),
        imageUrl: (await retrieveArtworkUrl(artworkData)).toString(),
        origin: {
            name: "Rijksmuseum",
            url: new URL("https://www.rijksmuseum.nl"),
        },
    }
}

type ArtworkVisualItemResponse = {
    represents_instance_of_type?: Array<{
        id?: string;
    }>;
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
async function retrieveArtworkTags(artwork: ArtworkDataResponse): Promise<string[]> {
    const visualItem: string = retrieveResourceId(artwork.shows?.[0].id, "visual item");
    const visualItemUrl = new URL(visualItem, baseApiAdress);
    const response = await fetch(visualItemUrl);
    if (!response.ok) {
        throw new Error(`Rijksmuseum visual item query failed: ${response.status} ${response.statusText}`);
    }

    const visualItemData = (await response.json()) as ArtworkVisualItemResponse;

    return visualItemData.represents_instance_of_type?.map((entry) => {
        return entry.id ?? ""
    }) ?? [];
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
