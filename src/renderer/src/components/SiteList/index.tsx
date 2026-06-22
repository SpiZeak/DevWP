import type { Site } from '@renderer/env';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Icon from '../ui/Icon';
import Spinner from '../ui/Spinner';
import type { NewSiteData } from './CreateSiteModal';
import { SiteActionProvider } from './SiteActionContext';
import SiteInfo from './SiteInfo';
import SiteItem from './SiteItem';

// Lazy load the modals
const CreateSiteModal = lazy(() => import('./CreateSiteModal'));
const WpCliModal = lazy(() => import('./WpCliModal'));
const EditSiteModal = lazy(() => import('./EditSiteModal'));
const ComposerModal = lazy(() => import('./ComposerModal'));

const SCROLLBAR_MARGIN = 16;

/** Shared suspense fallback for lazy-loaded modals */
const ModalFallback: React.FC = () => (
  <div className="z-50 fixed inset-0 flex justify-center items-center bg-warm-charcoal/70">
    <Spinner svgClass="size-8 text-pumpkin" />
  </div>
);

const SiteList: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [composerModal, setComposerModal] = useState<{
    open: boolean;
    site: Site | null;
  }>({ open: false, site: null });
  const [wpCliModal, setWpCliModal] = useState<{
    open: boolean;
    site: Site | null;
  }>({
    open: false,
    site: null,
  });
  const [editSiteModal, setEditSiteModal] = useState<{
    open: boolean;
    site: Site | null;
  }>({
    open: false,
    site: null,
  });
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const sitesListRef = useRef<HTMLUListElement>(null);
  const [scrollBar, setScrollBar] = useState({
    top: 0,
    height: 0,
    visible: false,
  });
  const barTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [barEverShown, setBarEverShown] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── action handlers (memoized for context stability) ──

  const openSiteUrl = useCallback((url: string): void => {
    void invoke('open_external', { url });
  }, []);

  const handleSelectSite = useCallback((site: Site): void => {
    setSelectedSite(site);
  }, []);

  const handleBackToList = useCallback((): void => {
    setSelectedSite(null);
  }, []);

  const handleCreateSite = useCallback((): void => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((): void => {
    setIsModalOpen(false);
  }, []);

  const fetchSites = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const siteList = await invoke<Site[]>('get_sites');
      setSites(siteList);
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmitNewSite = useCallback(
    async (newSiteData: NewSiteData): Promise<void> => {
      const provisionalSite: Site = {
        name: newSiteData.domain,
        path: `www/${newSiteData.domain}`,
        url: `https://${newSiteData.domain}`,
        status: 'provisioning',
      };

      setSites((prevSites) => [
        provisionalSite,
        ...prevSites.filter(
          (existingSite) =>
            !(
              existingSite.name === newSiteData.domain &&
              existingSite.status &&
              existingSite.status === 'provisioning'
            ),
        ),
      ]);

      try {
        await invoke('create_site', { site: newSiteData });
        await fetchSites();
        openSiteUrl(`https://${newSiteData.domain}`);
        setIsModalOpen(false);
      } catch (error) {
        console.error(`Failed to create new site: ${error}`);
        setSites((prevSites) =>
          prevSites.filter(
            (s) =>
              !(s.name === newSiteData.domain && s.status === 'provisioning'),
          ),
        );
        await fetchSites();

        const message =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.';
        void emit('notification', {
          type: 'error',
          message: `Provisioning failed for ${newSiteData.domain}: ${message}`,
        });
      }
    },
    [openSiteUrl, fetchSites],
  );

  const handleDeleteSite = useCallback(
    async (site: Site): Promise<void> => {
      const confirmed = window.confirm(
        `Are you sure you want to delete the site ${site.name}?`,
      );
      if (confirmed) {
        try {
          await invoke('delete_site', { site });
          setEditSiteModal({ open: false, site: null });
          await fetchSites();
        } catch (error) {
          console.error('Failed to delete site:', error);
        }
      }
    },
    [fetchSites],
  );

  const handleComposerUpdate = useCallback((site: Site): void => {
    setComposerModal({ open: true, site });
  }, []);

  const handleCloseComposerModal = useCallback((): void => {
    setComposerModal({ open: false, site: null });
  }, []);

  const handleOpenWpCliModal = useCallback((site: Site): void => {
    setWpCliModal({ open: true, site });
  }, []);

  const handleCloseWpCliModal = useCallback((): void => {
    setWpCliModal({ open: false, site: null });
  }, []);

  const handleOpenEditSiteModal = useCallback((site: Site): void => {
    setEditSiteModal({ open: true, site });
  }, []);

  const handleCloseEditSiteModal = useCallback((): void => {
    setEditSiteModal({ open: false, site: null });
  }, []);

  const handleUpdateSite = useCallback(
    async (
      site: Site,
      data: { aliases: string; webRoot: string },
    ): Promise<void> => {
      try {
        const result = await invoke<{ success: boolean; error?: string }>(
          'update_site',
          { site, data },
        );
        if (!result.success) {
          void emit('notification', {
            type: 'error',
            message: result.error || 'Failed to update site',
          });
          return;
        }
        setEditSiteModal({ open: false, site: null });
        await fetchSites();
      } catch (error) {
        console.error('Failed to update site:', error);
      }
    },
    [fetchSites],
  );

  // ── Scrollbar helpers ──

  const showScrollBar = useCallback(
    (barTop: number, barHeight: number): void => {
      setScrollBar({
        top: barTop,
        height: barHeight,
        visible: true,
      });
      setBarEverShown(true);
      setIsScrolling(true);
      if (barTimeoutRef.current) clearTimeout(barTimeoutRef.current);
      barTimeoutRef.current = setTimeout(() => {
        setScrollBar((b) => ({ ...b, visible: false }));
        setIsScrolling(false);
      }, 800);
    },
    [],
  );

  const updateScrollBar = useCallback((): void => {
    const el = sitesListRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) {
      setScrollBar({ top: 0, height: 0, visible: false });
      setIsScrolling(false);
      return;
    }
    const availableHeight = clientHeight - SCROLLBAR_MARGIN * 2;
    const barHeight = Math.max(
      (clientHeight / scrollHeight) * availableHeight,
      24,
    );
    const barTop =
      SCROLLBAR_MARGIN +
      (scrollTop / (scrollHeight - clientHeight)) *
        (availableHeight - barHeight);
    showScrollBar(barTop, barHeight);
  }, [showScrollBar]);

  const updateMaxHeight = useCallback((): void => {
    if (containerRef.current) {
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const availableHeight = window.innerHeight - containerTop - 120;
      setMaxHeight(Math.max(200, availableHeight));
    }
  }, []);

  // ── Effects ──

  // Scroll event listener for custom scrollbar
  useEffect(() => {
    const el = sitesListRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = (): void => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(() => {
          updateScrollBar();
          ticking = false;
        });
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (barTimeoutRef.current) clearTimeout(barTimeoutRef.current);
    };
  }, [updateScrollBar]);

  // Fetch sites on mount
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Recalc scrollbar and height when data changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: sites/loading/searchQuery intentional for recalc
  useEffect(() => {
    updateScrollBar();
    updateMaxHeight();
  }, [sites, loading, searchQuery, updateScrollBar, updateMaxHeight]);

  // Resize listener
  useEffect(() => {
    const handleResize = (): void => {
      updateMaxHeight();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateMaxHeight]);

  // ── Derived data ──

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return sites;

    const query = searchQuery.toLowerCase();
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(query) ||
        site.path.toLowerCase().includes(query) ||
        site.url.toLowerCase().includes(query),
    );
  }, [sites, searchQuery]);

  // Context value for site actions — stable reference due to useCallback
  const siteActions = useMemo(
    () => ({
      onOpenUrl: openSiteUrl,
      onComposerUpdate: handleComposerUpdate,
      onOpenWpCli: handleOpenWpCliModal,
      onEditSite: handleOpenEditSiteModal,
      onSelectSite: handleSelectSite,
    }),
    [
      openSiteUrl,
      handleComposerUpdate,
      handleOpenWpCliModal,
      handleOpenEditSiteModal,
      handleSelectSite,
    ],
  );

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6 w-full">
        <div className="flex items-center gap-3">
          <div className="flex justify-center items-center bg-linear-to-br from-gunmetal-700 to-gunmetal-600 rounded-lg w-8 h-8">
            <Icon className="text-warm-charcoal text-lg" content="󰌨" />
          </div>
          <h3 className="font-bold text-seasalt text-2xl">Sites</h3>
          {sites.length > 0 && (
            <span className="bg-gunmetal-500 px-3 py-1 rounded-full font-medium text-seasalt-300 text-sm">
              {searchQuery
                ? `${filteredSites.length}/${sites.length}`
                : sites.length}
            </span>
          )}
        </div>

        <button
          onClick={handleCreateSite}
          className="group flex justify-center items-center gap-2 bg-pumpkin hover:bg-pumpkin-600 hover:shadow-lg rounded-lg size-10 font-semibold text-warm-charcoal hover:scale-105 transition-all duration-200 cursor-pointer"
          title="Create a new site"
          type="button"
        >
          <Icon className="text-xl" content="" />
        </button>
      </div>

      {selectedSite ? (
        <SiteActionProvider value={siteActions}>
          <SiteInfo site={selectedSite} onBack={handleBackToList} />
        </SiteActionProvider>
      ) : (
        <>
          {/* Search Bar */}
          {sites.length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <Icon
                  className="top-1/2 left-3 absolute text-seasalt-400 text-lg -translate-y-1/2 transform"
                  content="󰍉"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sites by name, path, or URL..."
                  aria-label="Search sites"
                  className="bg-gunmetal-500 py-2.5 pr-4 pl-10 border border-gunmetal-600 focus:border-pumpkin rounded-lg focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors placeholder-seasalt-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="top-1/2 right-3 absolute text-seasalt-400 hover:text-seasalt transition-colors -translate-y-1/2 transform"
                    title="Clear search"
                    type="button"
                  >
                    <Icon className="text-lg" content="󰅖" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="relative" ref={containerRef}>
            <div className="bg-gunmetal-500 shadow-2xl rounded-xl overflow-hidden">
              <ul
                className="py-2 overflow-y-auto scrollbar-hide"
                ref={sitesListRef}
                style={{ maxHeight: `${maxHeight}px` }}
              >
                {loading ? (
                  <li className="flex justify-center items-center py-12">
                    <div className="flex items-center gap-3">
                      <Spinner svgClass="size-6 text-pumpkin" />
                      <span className="text-seasalt-300 text-lg">
                        Loading sites...
                      </span>
                    </div>
                  </li>
                ) : filteredSites.length === 0 ? (
                  <li className="flex flex-col justify-center items-center px-6 py-16 text-center">
                    <div className="flex justify-center items-center bg-gunmetal-500 mb-4 rounded-full w-16 h-16">
                      <Icon
                        className="text-seasalt-400 text-3xl"
                        content={searchQuery ? '󰍉' : '󰌨'}
                      />
                    </div>
                    <h4 className="mb-2 font-semibold text-seasalt text-xl">
                      {searchQuery ? 'No sites found' : 'No sites yet'}
                    </h4>
                    <p className="max-w-xs text-seasalt-400 text-sm">
                      {searchQuery
                        ? `No sites match "${searchQuery}". Try a different search term.`
                        : 'Create your first WordPress development site to get started'}
                    </p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="mt-3 text-pumpkin hover:text-pumpkin-600 text-sm underline transition-colors"
                        type="button"
                      >
                        Clear search
                      </button>
                    )}
                  </li>
                ) : (
                  <SiteActionProvider value={siteActions}>
                    {filteredSites.map((site, index) => (
                      <SiteItem
                        key={site.name}
                        site={site}
                        isLast={index === filteredSites.length - 1}
                      />
                    ))}
                  </SiteActionProvider>
                )}
              </ul>
            </div>
            {(scrollBar.visible ||
              isScrolling ||
              (!scrollBar.visible && barEverShown)) &&
              scrollBar.height > 0 && (
                <div
                  className={`absolute right-2 w-1 rounded-full bg-linear-to-b from-pumpkin to-pumpkin-600 z-10 transition-opacity duration-200 ${scrollBar.visible || isScrolling ? 'opacity-80' : 'opacity-0'}`}
                  style={{
                    top: scrollBar.top,
                    height: scrollBar.height,
                  }}
                />
              )}
          </div>
        </>
      )}

      <Suspense fallback={<ModalFallback />}>
        <CreateSiteModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleSubmitNewSite}
        />
      </Suspense>
      {wpCliModal.open && wpCliModal.site && (
        <Suspense fallback={<ModalFallback />}>
          <WpCliModal
            isOpen={wpCliModal.open}
            site={wpCliModal.site}
            onClose={handleCloseWpCliModal}
          />
        </Suspense>
      )}
      {composerModal.open && composerModal.site && (
        <Suspense fallback={<ModalFallback />}>
          <ComposerModal
            isOpen={composerModal.open}
            site={composerModal.site}
            onClose={handleCloseComposerModal}
          />
        </Suspense>
      )}
      {editSiteModal.open && editSiteModal.site && (
        <Suspense fallback={<ModalFallback />}>
          <EditSiteModal
            isOpen={editSiteModal.open}
            site={editSiteModal.site}
            onClose={handleCloseEditSiteModal}
            onSubmit={handleUpdateSite}
            onDelete={handleDeleteSite}
          />
        </Suspense>
      )}
    </div>
  );
};

export default SiteList;
