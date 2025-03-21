import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SearchWorkerManager from '../../webWorker/searchWorkerManager.ts?worker';
import { SearchParams } from '../../utils/searchParams';
import { SearchResults, SearchResultLines } from '../../webWorker/searchWorkerManager';
import { Status, statusError } from '../../utils/Status';
import SearchForm from './SearchForm';
import Results from './Results';
import { ShowModal } from '../Modal';

import '../../i18n/config';
import { formatBytesParams, localStorageGetItem, localStorageSetItem } from '../../utils/utils';
import { getDownloadSizeTotal } from '../../utils/files';

const searchModalWarn = 'corpus-warn';
const searchModalThreshold = 20_000_000; // 20 MB
function Search({showModal, richText, limit}: {showModal: ShowModal, richText: boolean, limit?: number}) {
  const { t } = useTranslation();
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>('initial');
  const [progress, setProgress] = useState(0.0);
  const [showId, setShowId] = useState(true);
  const [results, setResults] = useState<readonly SearchResultLines[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(localStorageGetItem(searchModalWarn) !== 'false');

  const onMessage = useCallback((e: MessageEvent<SearchResults>) => {
    if (e.data.complete) {
      setStatus(e.data.status);
      setProgress(e.data.progress);
      setShowId(e.data.showId);
      setResults(e.data.results);
      if (statusError.includes(e.data.status)) {
        showModal({
          message: t(`statusModal.${e.data.status}`),
          buttons: [{message: t('statusModal.buttons.ok'), autoFocus: true}],
        });
      }
    }
    else {
      setStatus(e.data.status);
      setProgress(e.data.progress);
    }
  }, []);

  const terminateWorker = () => {
    if (workerRef.current !== null) {
      console.log('Terminating worker!');
      workerRef.current.removeEventListener("message", onMessage);
      workerRef.current.terminate();
      workerRef.current = null;
      setStatus('initial');
      setProgress(0.0);
    }
  };

  const postToWorker = useCallback((params: SearchParams) => {
    setResults([]);
    if (params.query.length > 0 && params.collections.length > 0 && params.languages.length > 0) {
      if (workerRef.current === null) {
        console.log('Creating new worker...');
        workerRef.current = new SearchWorkerManager();
        workerRef.current.addEventListener("message", onMessage);
      }
      setProgress(0.0);
      if (import.meta.env.DEV) {
        console.log(params);
      }
      workerRef.current.postMessage(params);
    }
  }, []);

  const postToWorkerModal = useCallback((params: SearchParams) => {
    setStatus('waiting');
    if (!showSearchModal) {
      postToWorker(params);
      return;
    }

    getDownloadSizeTotal(params.collections).then((size) => {
      if (size <= searchModalThreshold) {
        postToWorker(params);
        return;
      }

      showModal({
        message: t('searchModal.message', formatBytesParams(size)),
        checkbox: {
          message: t('searchModal.checkboxDoNotShowAgain'),
          checked: false,
        },
        buttons: [
          {
            message: t('searchModal.buttons.yes'),
            callback: () => { postToWorker(params); },
            checkboxCallback: (checked) => {
              setShowSearchModal(!checked);
              localStorageSetItem(searchModalWarn, (!checked).toString());
            },
          },
          {
            message: t('searchModal.buttons.no'),
            callback: () => { setStatus('initial'); },
            autoFocus: true,
          },
        ],
        cancelCallback: () => { setStatus('initial'); },
      });
    }).catch((err: unknown) => {
      console.error(err);
    });
  }, [showSearchModal]);

  return (
    <>
      <SearchForm status={status} postToWorker={postToWorkerModal} terminateWorker={terminateWorker} />
      <Results status={status} progress={progress} showId={showId} richText={richText} results={results} limit={limit} />
    </>
  );
}

export default Search;
