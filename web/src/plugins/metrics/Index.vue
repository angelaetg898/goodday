<!-- Copyright 2022 Zinc Labs Inc. and Contributors

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http:www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License. 
-->

<!-- eslint-disable vue/attribute-hyphenation -->
<!-- eslint-disable vue/v-on-event-hyphenation -->
<template>
  <q-page class="metrics-page" id="logPage">
    <div class="row scroll" style="width: 100%">
      <!-- Note: Splitter max-height to be dynamically calculated with JS -->
      <q-splitter
        v-model="searchObj.config.splitterModel"
        :limits="searchObj.config.splitterLimit"
        style="width: 100%"
      >
        <template #before>
          <metric-list
            data-test="logs-search-index-list"
            :key="searchObj.data.metrics.metricList"
          />
        </template>
        <template #separator>
          <q-avatar
            color="primary"
            text-color="white"
            size="20px"
            icon="drag_indicator"
            style="top: 10px"
          />
        </template>
        <template #after>
          <div
            class="text-right q-px-lg q-pt-sm flex align-center justify-end metrics-date-time"
          >
            <date-time
              data-test="logs-search-bar-date-time-dropdown"
              @date-change="updateDateTime"
            />
            <auto-refresh-interval
              class="q-pr-sm"
              v-model="searchObj.meta.refreshInterval"
            />
            <q-btn
              data-test="logs-search-bar-refresh-btn"
              data-cy="search-bar-refresh-button"
              dense
              icon="refresh"
              title="Refresh"
              class="q-pa-none no-border refresh-button text-capitalize q-px-sm"
              rounded
              size="md"
              color="primary"
              @click="runQuery"
            />
          </div>
          <div v-if="searchObj.loading">
            <q-spinner-dots
              color="primary"
              size="40px"
              style="margin: 0 auto; display: block"
            />
          </div>
          <div
            v-else-if="
              searchObj.data.errorMsg !== '' && searchObj.loading == false
            "
          >
            <h5 class="text-center">
              <div
                data-test="logs-search-result-not-found-text"
                v-if="searchObj.data.errorCode == 0"
              >
                Result not found.
              </div>
              <div
                data-test="logs-search-error-message"
                v-html="searchObj.data.errorMsg"
              ></div>
              <br />
              <q-item-label>{{
                searchObj.data.additionalErrorMsg
              }}</q-item-label>
            </h5>
          </div>
          <div v-else-if="!!!searchObj.data.metrics.selectedMetrics.length">
            <h5
              data-test="logs-search-no-stream-selected-text"
              class="text-center"
            >
              No metrics selected.
            </h5>
          </div>
          <div
            v-else-if="
              searchObj.data.queryResults.hasOwnProperty('total') &&
              !!!searchObj.data.queryResults.hits.length &&
              !searchObj.loading
            "
          >
            <h5 class="text-center">No result found.</h5>
          </div>
          <div
            data-test="logs-search-search-result"
            v-if="
              searchObj.data.queryResults.hasOwnProperty('total') &&
              !!searchObj.data.queryResults.hits.length
            "
          >
            <metrics-viewer
              ref="searchResultRef"
              @update:datetime="searchData"
            />
          </div>
        </template>
      </q-splitter>
    </div>
  </q-page>
</template>

<script lang="ts">
// @ts-nocheck
import {
  defineComponent,
  onMounted,
  ref,
  onDeactivated,
  onActivated,
} from "vue";
import { useQuasar, date } from "quasar";
import { useStore } from "vuex";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import MetricList from "./MetricList.vue";
import MetricsViewer from "./MetricsViewer.vue";
import useMetrics from "@/composables/useMetrics";
import { Parser } from "node-sql-parser";

import streamService from "@/services/stream";
import searchService from "@/services/search";
import { b64EncodeUnicode } from "@/utils/zincutils";
import segment from "@/services/segment_analytics";
import config from "@/aws-exports";
import { logsErrorMessage } from "@/utils/common";
import DateTime from "@/components/DateTime.vue";
import AutoRefreshInterval from "@/components/AutoRefreshInterval.vue";
import { verifyOrganizationStatus } from "@/utils/zincutils";

export default defineComponent({
  name: "AppMetrics",
  components: {
    MetricList,
    MetricsViewer,
    DateTime,
    AutoRefreshInterval,
  },
  methods: {
    searchData() {
      if (!this.searchObj.loading) {
        this.runQuery();
      }

      if (config.isCloud == "true") {
        segment.track("Button Click", {
          button: "Refresh Metrics",
          user_org: this.store.state.selectedOrganization.identifier,
          user_id: this.store.state.userInfo.email,
          stream_name: this.searchObj.data.metrics.selectedMetrics[0],
          page: "Metrics explorer",
        });
      }
    },
  },
  setup() {
    const store = useStore();
    const router = useRouter();
    const $q = useQuasar();
    const { t } = useI18n();
    const { searchObj, resetSearchObj } = useMetrics();
    let dismiss = null;
    let refreshIntervalID = 0;
    const searchResultRef = ref(null);
    const searchBarRef = ref(null);
    const parser = new Parser();

    searchObj.organizationIdetifier =
      store.state.selectedOrganization.identifier;

    function ErrorException(message) {
      searchObj.loading = false;
      $q.notify({
        type: "negative",
        message: message,
        timeout: 10000,
        actions: [
          {
            icon: "close",
            color: "white",
            handler: () => {
              /* ... */
            },
          },
        ],
      });
    }

    function Notify() {
      return $q.notify({
        type: "positive",
        message: "Waiting for response...",
        timeout: 10000,
        actions: [
          {
            icon: "close",
            color: "white",
            handler: () => {
              /* ... */
            },
          },
        ],
      });
    }

    function getStreamList() {
      try {
        streamService
          .nameList(
            store.state.selectedOrganization.identifier,
            "metrics",
            true
          )
          .then((res) => {
            searchObj.data.streamResults = res.data;

            if (res.data.list.length > 0) {
              //extract stream data from response
              loadStreamLists();
            } else {
              searchObj.loading = false;
              searchObj.data.errorMsg =
                "No stream found in selected organization!";
              searchObj.data.metrics.metricList = [];
              searchObj.data.queryResults = {};
              searchObj.data.histogram = {
                xData: [],
                yData: [],
                chartParams: {},
              };
            }
          })
          .catch((e) => {
            searchObj.loading = false;
            $q.notify({
              type: "negative",
              message:
                "Error while pulling index for selected organization" +
                e.message,
              timeout: 2000,
            });
          });
      } catch (e) {
        throw new ErrorException(e.message);
      }
    }

    function loadStreamLists() {
      try {
        searchObj.data.metrics.metricList = [];
        searchObj.data.metrics.selectedMetrics = [];
        if (searchObj.data.streamResults.list.length) {
          let lastUpdatedStreamTime = 0;
          let selectedStreamItemObj = {};
          searchObj.data.streamResults.list.map((item: any) => {
            let itemObj = {
              label: item.name,
              value: item.name,
            };
            searchObj.data.metrics.metricList.push(itemObj);

            if (item.stats.doc_time_max >= lastUpdatedStreamTime) {
              lastUpdatedStreamTime = item.stats.doc_time_max;
              selectedStreamItemObj = itemObj;
            }
          });
          if (selectedStreamItemObj.label != undefined) {
            searchObj.data.metrics.selectedMetrics = [];
            searchObj.data.metrics.selectedMetrics.push(
              selectedStreamItemObj.value
            );
          } else {
            searchObj.loading = false;
            searchObj.data.queryResults = {};
            searchObj.data.metrics.selectedMetrics = [];
            searchObj.data.histogram = {
              xData: [],
              yData: [],
              chartParams: {},
            };
          }
        } else {
          searchObj.loading = false;
        }
      } catch (e) {
        throw new ErrorException(e.message);
      }
    }

    function getConsumableDateTime() {
      try {
        if (searchObj.data.datetime.tab == "relative") {
          let period = "";
          let periodValue = 0;
          // quasar does not support arithmetic on weeks. convert to days.

          if (
            searchObj.data.datetime.relative.period.label.toLowerCase() ==
            "weeks"
          ) {
            period = "days";
            periodValue = searchObj.data.datetime.relative.value * 7;
          } else {
            period =
              searchObj.data.datetime.relative.period.label.toLowerCase();
            periodValue = searchObj.data.datetime.relative.value;
          }
          const subtractObject = '{"' + period + '":' + periodValue + "}";

          let endTimeStamp = new Date();

          const startTimeStamp = date.subtractFromDate(
            endTimeStamp,
            JSON.parse(subtractObject)
          );

          return {
            start_time: startTimeStamp,
            end_time: endTimeStamp,
          };
        } else {
          let start, end;
          if (
            searchObj.data.datetime.absolute.date.from == "" &&
            searchObj.data.datetime.absolute.startTime == ""
          ) {
            start = new Date();
          } else {
            start = new Date(
              searchObj.data.datetime.absolute.date.from +
                " " +
                searchObj.data.datetime.absolute.startTime
            );
          }
          if (
            searchObj.data.datetime.absolute.date.to == "" &&
            searchObj.data.datetime.absolute.endTime == ""
          ) {
            end = new Date();
          } else {
            end = new Date(
              searchObj.data.datetime.absolute.date.to +
                " " +
                searchObj.data.datetime.absolute.endTime
            );
          }
          const rVal = {
            start_time: start,
            end_time: end,
          };
          return rVal;
        }
      } catch (e) {
        throw new ErrorException(e.message);
      }
    }

    function buildSearch() {
      try {
        var req: any = {
          query: {
            sql: `select histogram(${store.state.zoConfig.timestamp_column}, 1000) as zo_timestamp, max(value) as max, avg(value) as avg, min(value) as min from "[INDEX_NAME]" group by zo_timestamp ORDER BY zo_timestamp`,
            start_time: (new Date().getTime() - 900000) * 1000,
            end_time: new Date().getTime() * 1000,
            from: 0,
            size: 1000,
            sql_mode: "full",
          },
          encoding: "base64",
        };

        var timestamps: any = getConsumableDateTime();
        if (
          timestamps.start_time != "Invalid Date" &&
          timestamps.end_time != "Invalid Date"
        ) {
          const startISOTimestamp: any =
            new Date(timestamps.start_time.toISOString()).getTime() * 1000;
          const endISOTimestamp: any =
            new Date(timestamps.end_time.toISOString()).getTime() * 1000;
          req.query.start_time = startISOTimestamp;
          req.query.end_time = endISOTimestamp;
        } else {
          return false;
        }

        req.query.sql = req.query.sql.replace(
          "[INDEX_NAME]",
          searchObj.data.metrics.selectedMetrics[0]
        );

        req.query.sql = b64EncodeUnicode(req.query.sql);
        return req;
      } catch (e) {
        throw new ErrorException(e.message);
      }
    }

    function runQuery() {
      try {
        if (!searchObj.data.metrics.selectedMetrics.length) {
          return false;
        }

        dismiss = Notify();
        const queryReq = buildSearch();
        if (queryReq == null) {
          dismiss();
          return false;
        }

        searchObj.data.errorMsg = "";
        searchObj.data.errorCode = 0;

        searchService
          .search({
            org_identifier: searchObj.organizationIdetifier,
            query: queryReq,
            page_type: "metrics",
          })
          .then((res) => {
            searchObj.data.queryResults = { ...res.data };
            generateHistogramData();
            //update grid columns
            dismiss();
          })
          .catch((err) => {
            searchObj.data.queryResults = {};
            searchObj.data.histogram = {
              xData: [],
              yData: [],
              chartParams: {},
            };
            dismiss();
            if (err.response != undefined) {
              searchObj.data.errorMsg = err.response.data.error;
            } else {
              searchObj.data.errorMsg = err.message;
            }

            const customMessage = logsErrorMessage(err.response.data.code);
            searchObj.data.errorCode = err.response.data.code;
            if (customMessage != "") {
              searchObj.data.errorMsg = t(customMessage);
            }
          })
          .finally(() => {
            searchObj.loading = false;
          });
      } catch (e) {
        throw new ErrorException("Request failed.", e.message);
      }
    }

    const getDefaultTrace = (trace: any) => {
      return {
        x: [],
        y: [],
        unparsed_x: [],
        name: trace.name || "",
        type: trace.type || "line",
        marker: {
          color: trace.color || "#5960b2",
          opacity: trace.opacity || 0.8,
        },
      };
    };

    function generateHistogramData() {
      const unparsed_x_data: any[] = [];
      const xData: string[] = [];

      const minTrace = getDefaultTrace({
        name: "Min",
        color: "#7fc845",
        opacity: 0.8,
      });
      const maxTrace = getDefaultTrace({
        name: "Max",
        color: "#458cc8",
        opacity: 0.8,
      });
      const avgTrace = getDefaultTrace({
        name: "Avg",
        color: "#c85e45",
        opacity: 0.8,
      });

      if (searchObj.data.queryResults.hits.length) {
        searchObj.data.queryResults.hits.forEach(
          (bucket: {
            avg: number;
            max: number;
            min: number;
            zo_timestamp: string | Date | number;
          }) => {
            unparsed_x_data.push(bucket.zo_timestamp);
            let histDate = new Date(bucket.zo_timestamp + "Z");
            xData.push(Math.floor(histDate.getTime()));
            minTrace.y.push(parseInt(bucket.min, 10));
            maxTrace.y.push(parseInt(bucket.max, 10));
            avgTrace.y.push(parseInt(bucket.avg, 10));
          }
        );
      }

      minTrace.x = xData;
      minTrace.unparsed_x = unparsed_x_data;

      maxTrace.x = xData;
      maxTrace.unparsed_x = unparsed_x_data;

      avgTrace.x = xData;
      avgTrace.unparsed_x = unparsed_x_data;

      const chartParams = {
        title:
          "Showing " +
          Math.min(
            searchObj.data.queryResults.size,
            searchObj.data.queryResults.total
          ) +
          " out of " +
          searchObj.data.queryResults.total.toLocaleString() +
          " hits in " +
          searchObj.data.queryResults.took +
          " ms. (Scan Size: " +
          searchObj.data.queryResults.scan_size +
          "MB)",
      };
      searchObj.data.histogram = {
        data: [minTrace, maxTrace, avgTrace],
        layout: chartParams,
      };
      if (searchResultRef.value?.reDrawChart) {
        setTimeout(() => {
          searchResultRef.value.reDrawChart();
        }, 500);
      }
    }

    function loadPageData() {
      searchObj.loading = true;
      resetSearchObj();
      searchObj.organizationIdetifier =
        store.state.selectedOrganization.identifier;

      //get stream list
      getStreamList();
    }

    onMounted(() => {
      if (searchObj.loading == false) {
        loadPageData();

        refreshData();
      }
    });

    onDeactivated(() => {
      clearInterval(refreshIntervalID);
    });

    onActivated(() => {
      refreshData();

      if (
        searchObj.organizationIdetifier !=
        store.state.selectedOrganization.identifier
      ) {
        loadPageData();
      }

      setTimeout(() => {
        if (searchResultRef.value) searchResultRef.value.reDrawChart();
      }, 1500);
    });

    const refreshData = () => {
      if (
        searchObj.meta.refreshInterval > 0 &&
        router.currentRoute.value.name == "metrics"
      ) {
        clearInterval(refreshIntervalID);

        refreshIntervalID = setInterval(() => {
          if (!searchObj.loading) runQuery();
        }, parseInt(searchObj.meta.refreshInterval) * 1000);

        $q.notify({
          message: `Live mode is enabled`,
          color: "positive",
          position: "top",
          timeout: 1000,
        });
      } else {
        clearInterval(refreshIntervalID);
      }
    };

    const setQuery = () => {};

    const updateDateTime = (value: any) => {
      searchObj.data.datetime = value;

      if (config.isCloud == "true" && value.userChangedValue) {
        let dateTimeVal;
        if (value.tab === "relative") {
          dateTimeVal = value.relative;
        } else {
          dateTimeVal = value.absolute;
        }

        segment.track("Button Click", {
          button: "Date Change",
          tab: value.tab,
          value: dateTimeVal,
          metric_name: searchObj.data.metrics.selectedMetrics[0],
          page: "Search Metrics",
        });
      }
    };

    return {
      store,
      router,
      parser,
      searchObj,
      searchBarRef,
      loadPageData,
      runQuery,
      searchResultRef,
      getConsumableDateTime,
      refreshData,
      setQuery,
      updateDateTime,
      verifyOrganizationStatus,
    };
  },
  computed: {
    showQuery() {
      return this.searchObj.meta.showQuery;
    },
    changeOrganization() {
      return this.store.state.selectedOrganization.identifier;
    },
    selectedMetrics() {
      return this.searchObj.data.metrics.selectedMetrics;
    },
    changeRelativeDate() {
      return (
        this.searchObj.data.datetime.relative.value +
        this.searchObj.data.datetime.relative.period.value
      );
    },
    changeRefreshInterval() {
      return this.searchObj.meta.refreshInterval;
    },
  },
  watch: {
    changeOrganization() {
      // Fetch and update selected metrics
      this.verifyOrganizationStatus(
        this.store.state.organizations,
        this.router
      );
      this.loadPageData();
    },
    selectedMetrics: {
      deep: true,
      handler: function () {
        if (this.searchObj.data.metrics.selectedMetrics.length) {
          setTimeout(() => {
            this.runQuery();
          }, 500);
        }
      },
    },
    changeRelativeDate() {
      if (this.searchObj.data.datetime.tab == "relative") {
        this.runQuery();
      }
    },
    changeRefreshInterval() {
      this.refreshData();
    },
  },
});
</script>

<style lang="scss">
div.plotly-notifier {
  visibility: hidden;
}
.metrics-page {
  .index-menu .field_list .field_overlay .field_label,
  .q-field__native,
  .q-field__input,
  .q-table tbody td {
    font-size: 12px !important;
  }

  .q-splitter__after {
    overflow: hidden;
  }

  .q-item__label span {
    /* text-transform: capitalize; */
  }

  .index-table :hover::-webkit-scrollbar,
  #searchGridComponent:hover::-webkit-scrollbar {
    height: 13px;
    width: 13px;
  }

  .index-table ::-webkit-scrollbar-track,
  #searchGridComponent::-webkit-scrollbar-track {
    -webkit-box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
    border-radius: 10px;
  }

  .index-table ::-webkit-scrollbar-thumb,
  #searchGridComponent::-webkit-scrollbar-thumb {
    border-radius: 10px;
    -webkit-box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.5);
  }

  .q-table__top {
    padding: 0px !important;
  }

  .q-table__control {
    width: 100%;
  }

  .q-field__control-container {
    padding-top: 0px !important;
  }

  .refresh-button {
    .q-icon {
      font-size: 18px;
      padding-right: 2px;
    }
  }

  .metrics-date-time {
    .date-time-button {
      height: 100%;
      padding: 0 8px;
      background-color: #ffffff !important;
    }
  }
}
</style>
