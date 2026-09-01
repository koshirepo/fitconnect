/**
 * Documentation: Reading a picked file in the browser.
 *
 * - Turns a `File` from an input or a camera capture into the base64 data URL the public signup endpoints take in their request body.
 * - Those endpoints need it because `/uploads` requires a session and their callers have none — the image travels with the record it belongs to. See `lib/data-url-image.ts` in the API for the other half of that contract.
 * - Primary exports: readFileAsDataUrl.
 */

/**
 * Read a file into a `data:` URL.
 *
 * The rejection message is the caller's, because "that photo could not be
 * read" and "that logo could not be read" are the same failure told to
 * different people.
 */
export function readFileAsDataUrl(file: File, errorMessage = "That file could not be read.") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(file);
  });
}
