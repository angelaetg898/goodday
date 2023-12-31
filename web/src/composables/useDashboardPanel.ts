// Copyright 2022 Zinc Labs Inc. and Contributors

//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at

//      http:www.apache.org/licenses/LICENSE-2.0

//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

import { reactive, computed } from "vue";
import StreamService from '@/services/stream';
import { useStore } from "vuex";
import { useQuasar } from "quasar";

const colors = [
  '#5960b2',
  '#c23531',
  '#2f4554',
  '#61a0a8',
  '#d48265',
  '#91c7ae',
  '#749f83',
  '#ca8622',
  '#bda29a',
  '#6e7074',
  '#546570',
  '#c4ccd3'
]

const getDefaultDashboardPanelData = () => (
  {
    data: {
      id: "",
      type: "bar",
      fields: {
        stream: '',
        stream_type: 'logs',
        x: <any>[],
        y: <any>[],
        filter: <any>[]
      },
      config: {
        title: "",
        description: "",
        show_legends: true,
      },
      queryType: "sql",
      query: "",
      customQuery: false
    },
    layout: {
      splitter: 20
    },
    meta: {
      parsedQuery: "",
      dragAndDrop: {
        dragging: false,
        dragElement: null
      },
      errors: {
        queryErrors: []
      },
      editorValue: "",
      dateTime: {start_time: new Date(), end_time: new Date()},
      filterValue: <any>[],
      stream: {
        selectedStreamFields: [],
        customQueryFields: [],
        functions: [],
        streamResults: <any>[],
        filterField: "",
      },
    }
  }
)

let dashboardPanelData = reactive({ ...getDefaultDashboardPanelData()});

const useDashboardPanelData = () => {
  const store = useStore();
  const $q = useQuasar();

  const resetDashboardPanelData = () => {
    Object.assign(dashboardPanelData, getDefaultDashboardPanelData());
    // console.log("updated...",dashboardPanelData);
  };

  const generateLabelFromName = (name: string) => {
    return name.replace(/[\_\-\s\.]/g,' ').split(' ').map(string => string.charAt(0).toUpperCase() + string.slice(1)).filter(it => it).join(' ')
  }

  const promqlMode = computed(() => dashboardPanelData.data.fields.stream_type == "metrics" && dashboardPanelData.data.customQuery && dashboardPanelData.data.queryType == "promql")

  const isAddXAxisNotAllowed = computed((e: any) => {
    switch (dashboardPanelData.data.type) {
      case 'pie':
      case 'donut':
        return dashboardPanelData.data.fields.x.length >= 1
      case 'metric':
        return dashboardPanelData.data.fields.x.length >= 0
      case 'table':
        return false
      default:
        return dashboardPanelData.data.fields.x.length >= 2;
    }
  })

  const isAddYAxisNotAllowed = computed((e: any) => {
    switch (dashboardPanelData.data.type) {
      case 'pie':
      case 'donut':
        return dashboardPanelData.data.fields.y.length >= 1
      case 'metric':
        return dashboardPanelData.data.fields.y.length >= 1
      case 'stacked':
      case 'h-stacked':
        return dashboardPanelData.data.fields.y.length >= 1
      default:
        return false;
    }
  })

  const addXAxisItem = (row: any) => {
    if(!dashboardPanelData.data.fields.x) {
      dashboardPanelData.data.fields.x = []
    }

    if(isAddXAxisNotAllowed.value){
      return;
    }

    // check for existing field
    if(!dashboardPanelData.data.fields.x.find((it:any) => it.column == row.name)) {
      dashboardPanelData.data.fields.x.push({
        label: !dashboardPanelData.data.customQuery ? generateLabelFromName(row.name) : row.name,
        alias: !dashboardPanelData.data.customQuery ? 'x_axis_' + (dashboardPanelData.data.fields.x.length + 1) : row.name,
        column: row.name,
        color: null,
        aggregationFunction: (row.name == store.state.zoConfig.timestamp_column) ? 'histogram' : null
      })
    }

    updateArrayAlias()
  }

  const addYAxisItem = (row: any) => {
    if(!dashboardPanelData.data.fields.y) {
      dashboardPanelData.data.fields.y = []
    }

    if(isAddYAxisNotAllowed.value){
      return;
    }

    if(!dashboardPanelData.data.fields.y.find((it:any) => it.column == row.name)) {
      dashboardPanelData.data.fields.y.push({
        label: !dashboardPanelData.data.customQuery ? generateLabelFromName(row.name) : row.name,
        alias: !dashboardPanelData.data.customQuery ? 'y_axis_' + (dashboardPanelData.data.fields.y.length + 1) : row.name,
        column: row.name,
        color: getNewColorValue(),
        aggregationFunction: 'count'
      })
    }
    updateArrayAlias()
  }

  // get new color value based on existing color from the chart
  const getNewColorValue = () => {
   const YAxisColor = dashboardPanelData.data.fields.y.map((it: any)=> it.color)
   let newColor = colors.filter((el:any) => !YAxisColor.includes(el));
    if(!newColor.length){
      newColor = colors
    }
    return newColor[0]
  }

  // update X or Y axis aliases when new value pushes into the X and Y axes arrays
  const updateArrayAlias = () => {
    dashboardPanelData.data.fields.x.forEach((it:any, index:any) => it.alias = !dashboardPanelData.data.customQuery ? 'x_axis_' + (index + 1) : it.column )
    dashboardPanelData.data.fields.y.forEach((it:any, index:any) => it.alias = !dashboardPanelData.data.customQuery ? 'y_axis_' + (index + 1) : it.column )
  }


  const removeXAxisItem = (name: string) => {
    const index = dashboardPanelData.data.fields.x.findIndex((it:any) => it.column == name)
    if(index >= 0) {
      dashboardPanelData.data.fields.x.splice(index, 1)
    }
  }

  const removeYAxisItem = (name: string) => {
    const index = dashboardPanelData.data.fields.y.findIndex((it:any) => it.column == name)
    if(index >= 0) {
      dashboardPanelData.data.fields.y.splice(index, 1)
    }
  }

  const removeFilterItem = (name: string) => {
    const index = dashboardPanelData.data.fields.filter.findIndex((it:any) => it.column == name)
    if(index >= 0) {
      dashboardPanelData.data.fields.filter.splice(index, 1)
    }
  }

  const addFilteredItem = (name: string) => {
    // console.log("name=", name);
    if (!dashboardPanelData.data.fields.filter) {
      dashboardPanelData.data.fields.filter = [];
    }

    if (
      !dashboardPanelData.data.fields.filter.find(
        (it: any) => it.column == name
      )
    ) {
      // console.log("data");

      dashboardPanelData.data.fields.filter.push({
        type: "list",
        values: [],
        column: name,
        operator: null,
        value: null,
      });
    }

    if (!dashboardPanelData.meta.filterValue) {
      dashboardPanelData.meta.filterValue = [];
    }

    // remove any existing data
    const find = dashboardPanelData.meta.filterValue.findIndex((it: any) => it.column == name)
    if (find >= 0) {
      dashboardPanelData.meta.filterValue.splice(find, 1);
    }

    StreamService
      .fieldValues({
        org_identifier: store.state.selectedOrganization.identifier,
        stream_name: dashboardPanelData.data.fields.stream,
        start_time:  new Date(dashboardPanelData.meta.dateTime["start_time"].toISOString()).getTime() * 1000,
        end_time:  new Date(dashboardPanelData.meta.dateTime["end_time"].toISOString()).getTime() * 1000,
        fields: [name],
        size: 10,
      })
      .then((res:any) => {
        dashboardPanelData.meta.filterValue.push({
          column: name,
          value: res?.data?.hits?.[0]?.values
            .map((it: any) => it.key)
            .filter((it: any) => it),
        });

      })
      .catch((error) => {
        $q.notify({
          type: "negative",
          message: "Something went wrong!",
          timeout: 5000,
        });
      });
  }

  const removeXYFilters = () => {
    dashboardPanelData.data.fields.x.splice(0,dashboardPanelData.data.fields.x.length)
    dashboardPanelData.data.fields.y.splice(0,dashboardPanelData.data.fields.y.length)
    dashboardPanelData.data.fields.filter.splice(0,dashboardPanelData.data.fields.filter.length)
  }

  return { 
    dashboardPanelData, 
    resetDashboardPanelData, 
    addXAxisItem, 
    addYAxisItem,
    removeXAxisItem,
    removeYAxisItem,
    removeFilterItem,
    addFilteredItem,
    removeXYFilters,
    isAddXAxisNotAllowed,
    isAddYAxisNotAllowed,
    promqlMode,
  };
};

export default useDashboardPanelData;
