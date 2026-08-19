/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { FC, ChangeEvent, useEffect, useState } from 'react';

import { Input, Select, Tooltip } from '@superset-ui/core/components';
import {
  isFeatureEnabled,
  FeatureFlag,
  styled,
  SupersetClient,
  useTheme,
  t,
  css,
} from '@superset-ui/core';
import {
  Operators,
  OPERATORS_OPTIONS,
  HAVING_OPERATORS,
  MULTI_OPERATORS,
  CUSTOM_OPERATORS,
  DISABLE_INPUT_OPERATORS,
  AGGREGATES,
  OPERATOR_ENUM_TO_OPERATOR_TYPE,
} from 'src/explore/constants';
import FilterDefinitionOption from 'src/explore/components/controls/MetricControl/FilterDefinitionOption';
import AdhocFilter from 'src/explore/components/controls/FilterControl/AdhocFilter';
import { optionLabel } from 'src/utils/common';
import {
  ColumnMeta,
  Dataset,
  isTemporalColumn,
} from '@superset-ui/chart-controls';
import useAdvancedDataTypes from './useAdvancedDataTypes';
import { useDatePickerInAdhocFilter } from '../utils';
import { Clauses, ExpressionTypes } from '../types';

const SelectWithLabel = styled(Select)<{ labelText: string }>`
  .ant-select-selector::after {
    content: ${({ labelText }) => labelText || '\\A0'};
    display: inline-block;
    white-space: nowrap;
    color: ${({ theme }) => theme.colorTextSecondary};
    width: max-content;
  }
`;

export interface SimpleExpressionType {
  expressionType: keyof typeof ExpressionTypes;
  column: ColumnMeta;
  aggregate: keyof typeof AGGREGATES;
  label: string;
}
export interface SQLExpressionType {
  expressionType: keyof typeof ExpressionTypes;
  sqlExpression: string;
  label: string;
}

export interface MetricColumnType {
  saved_metric_name: string;
}

export type ColumnType =
  | ColumnMeta
  | SimpleExpressionType
  | SQLExpressionType
  | MetricColumnType;

export interface Props {
  adhocFilter: AdhocFilter;
  onChange: (filter: AdhocFilter) => void;
  options: ColumnType[];
  datasource: Dataset;
  partitionColumn: string;
  operators?: Operators[];
  validHandler: (isValid: boolean) => void;
}

export interface AdvancedDataTypesState {
  parsedAdvancedDataType: string;
  advancedDataTypeOperatorList: string[];
  errorMessage: string;
}

export const useSimpleTabFilterProps = (props: Props) => {

  const isOperatorRelevant = (operator: Operators, subject: string) => {
    const column = props.datasource.columns?.find(
      col => col.column_name === subject,
    );
    const isColumnBoolean =
      !!column && (column.type === 'BOOL' || column.type === 'BOOLEAN');
    const isColumnNumber =
      !!column && (column.type === 'INT' || column.type === 'INTEGER');
    const isColumnFunction = !!column && !!column.expression;

    if (operator && operator === Operators.LatestPartition) {
      const { partitionColumn } = props;
      return partitionColumn && subject && subject === partitionColumn;
    }
    if (operator === Operators.TemporalRange) {
      return isTemporalColumn(subject, props.datasource);
    }
    if (operator === Operators.IsTrue || operator === Operators.IsFalse) {
      return isColumnBoolean || isColumnNumber || isColumnFunction;
    }
    if (isColumnBoolean) {
      return operator === Operators.IsNull || operator === Operators.IsNotNull;
    }
    return (
      props.adhocFilter.clause !== Clauses.Having ||
      HAVING_OPERATORS.indexOf(operator) !== -1
    );
  };
  const onSubjectChange = (id: string) => {
    const option = props.options.find(
      option =>
        ('column_name' in option && option.column_name === id) ||
        ('optionName' in option && option.optionName === id),
    );
    let subject = '';
    let clause;
    // Infer the new clause based on what subject was selected.
    if (option && 'column_name' in option) {
      subject = option.column_name;
      clause = Clauses.Where;
    } else if (option && 'saved_metric_name' in option) {
      subject = option.saved_metric_name;
      clause = Clauses.Having;
    } else if (option?.label) {
      subject = option.label;
      clause = Clauses.Having;
    }

    const operatorId = Operators.Equals;

    props.onChange(
      props.adhocFilter.duplicateWith({
        subject,
        clause,
        operatorId,
        operator: OPERATOR_ENUM_TO_OPERATOR_TYPE[operatorId].operation,
        comparator: undefined,
        expressionType: ExpressionTypes.Simple,
      }),
    );
  };
  const onOperatorChange = (operatorId: Operators) => {
    const currentOperatorId = props.adhocFilter.operatorId;
    const currentComparator = props.adhocFilter.comparator;
    const changingTimeRangeMode =
      operatorId === Operators.TemporalRange ||
      currentOperatorId === Operators.TemporalRange;

    let newComparator;
    if (changingTimeRangeMode) {
      // Date ranges and regular comparator values are not interchangeable.
      newComparator = undefined;
    } else if (MULTI_OPERATORS.has(operatorId)) {
      // Convert an individual comparator into a list comparator.
      newComparator = Array.isArray(currentComparator)
        ? currentComparator
        : [currentComparator].filter(element => element);
    } else {
      // Convert a list comparator into an individual comparator.
      newComparator = Array.isArray(currentComparator)
        ? currentComparator[0]
        : currentComparator;
    }

    if (operatorId && CUSTOM_OPERATORS.has(operatorId)) {
      props.onChange(
        props.adhocFilter.duplicateWith({
          subject: props.adhocFilter.subject,
          clause: Clauses.Where,
          operatorId,
          operator: OPERATOR_ENUM_TO_OPERATOR_TYPE[operatorId].operation,
          comparator: newComparator,
          expressionType: ExpressionTypes.Sql,
          datasource: props.datasource,
        }),
      );
    } else {
      props.onChange(
        props.adhocFilter.duplicateWith({
          operatorId,
          operator: OPERATOR_ENUM_TO_OPERATOR_TYPE[operatorId].operation,
          comparator: newComparator,
          expressionType: ExpressionTypes.Simple,
        }),
      );
    }
  };
  const onComparatorChange = (comparator: string) => {
    props.onChange(
      props.adhocFilter.duplicateWith({
        comparator,
        expressionType: ExpressionTypes.Simple,
      }),
    );
  };
  const clearOperator = (): void => {
    props.onChange(
      props.adhocFilter.duplicateWith({
        operatorId: undefined,
        operator: undefined,
      }),
    );
  };
  const onDatePickerChange = (columnName: string, timeRange: string) => {
    props.onChange(
      props.adhocFilter.duplicateWith({
        subject: columnName,
        operator: Operators.TemporalRange,
        operatorId: Operators.TemporalRange,
        comparator: timeRange,
        expressionType: ExpressionTypes.Simple,
      }),
    );
  };
  return {
    onSubjectChange,
    onOperatorChange,
    onComparatorChange,
    isOperatorRelevant,
    clearOperator,
    onDatePickerChange,
  };
};

const AdhocFilterEditPopoverSimpleTabContent: FC<Props> = props => {
  const {
    onSubjectChange,
    onOperatorChange,
    isOperatorRelevant,
    onComparatorChange,
    onDatePickerChange,
  } = useSimpleTabFilterProps(props);
  const [suggestions, setSuggestions] = useState<
    Record<'label' | 'value', any>[]
  >([]);
  const [comparator, setComparator] = useState(props.adhocFilter.comparator);
  const [loadingComparatorSuggestions, setLoadingComparatorSuggestions] =
    useState(false);

  /**
   * Focus comparator only after an explicit subject/operator selection.
   *
   * Do not derive this from `subject && operatorId`, because that is already
   * true when editing an existing filter. If comparator auto-focuses merely
   * because those values exist, it can steal focus when the operator dropdown
   * is opened and make the dropdown close immediately.
   */
  const [focusComparatorAfterChange, setFocusComparatorAfterChange] =
    useState(false);

  const {
    advancedDataTypesState,
    subjectAdvancedDataType,
    fetchAdvancedDataTypeValueCallback,
    fetchSubjectAdvancedDataType,
  } = useAdvancedDataTypes(props.validHandler);
  // TODO: This does not need to exist, just use the advancedTypeOperatorList list
  const isOperatorRelevantWrapper = (operator: Operators, subject: string) =>
    subjectAdvancedDataType
      ? isOperatorRelevant(operator, subject) &&
        advancedDataTypesState.advancedDataTypeOperatorList.includes(operator)
      : isOperatorRelevant(operator, subject);
  const onInputComparatorChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setComparator(value);
    onComparatorChange(value);
  };

  const renderSubjectOptionLabel = (option: ColumnType) => (
    <FilterDefinitionOption option={option} />
  );

  const getOptionsRemaining = () => {
    // if select is multi/value is array, we show the options not selected
    const valuesFromSuggestionsLength = Array.isArray(comparator)
      ? comparator.filter(v => suggestions.includes(v)).length
      : 0;
    return suggestions ? suggestions.length - valuesFromSuggestionsLength : 0;
  };
  const createSuggestionsPlaceholder = () => {
    const optionsRemaining = getOptionsRemaining();
    const placeholder = t('%s option(s)', optionsRemaining);
    return optionsRemaining ? placeholder : '';
  };

  const handleSubjectChange = (subject: string) => {
    setComparator(undefined);
    onSubjectChange(subject);

    /**
     * Always request comparator focus after subject selection.
     *
     * If the selected subject becomes a temporal column, `datePicker` will
     * replace the comparator UI. If the resulting operator disables comparator
     * input, the rendered control is disabled and will not meaningfully accept
     * focus.
     */
    setFocusComparatorAfterChange(true);
  };

  const handleOperatorChange = (operatorId: Operators) => {
    const changingTimeRangeMode =
      operatorId === Operators.TemporalRange ||
      props.adhocFilter.operatorId === Operators.TemporalRange;

    if (changingTimeRangeMode) {
      setComparator(undefined);
    }

    onOperatorChange(operatorId);

    if (
      operatorId !== Operators.TemporalRange &&
      !DISABLE_INPUT_OPERATORS.includes(operatorId)
    ) {
      setFocusComparatorAfterChange(true);
    } else {
      setFocusComparatorAfterChange(false);
    }
  };

  let columns = props.options;
  const { subject, operator, operatorId } = props.adhocFilter;

  const subjectSelectProps = {
    ariaLabel: t('Select subject'),
    value: subject ?? undefined,
    onChange: handleSubjectChange,
    notFoundContent: t(
      'No such column found. To filter on a metric, try the Custom SQL tab.',
    ),
    autoFocus: !subject,
    placeholder: '',
    filterSort: undefined,
  };

  subjectSelectProps.placeholder =
    props.adhocFilter.clause === Clauses.Where
      ? t('%s column(s)', columns.length)
      : t('To filter on a metric, use Custom SQL tab.');
  columns = props.options.filter(
    option => 'column_name' in option && option.column_name,
  );

  columns = columns.sort((col1, col2) => {
    if (
      (('description' in col1 && col1.description) || "")
      < (('description' in col2 && col2.description ) || "")){
      return -1; 
    }
    if (
      (('description' in col1 && col1.description) || "")
      > (('description' in col2 && col2.description ) || "")){
      return 1;
    }
    return 0;
  })  

  const operatorSelectProps = {
    placeholder: t(
      '%s operator(s)',
      (props.operators ?? OPERATORS_OPTIONS).filter(op =>
        isOperatorRelevantWrapper(op, subject),
      ).length,
    ),
    value: operatorId,
    onChange: handleOperatorChange,
    autoFocus: !!subjectSelectProps.value && !operator,
    ariaLabel: t('Select operator'),
  };

  const shouldFocusComparator = focusComparatorAfterChange;

  const comparatorSelectProps = {
    allowClear: true,
    allowNewOptions: true,
    ariaLabel: t('Comparator option'),
    mode: MULTI_OPERATORS.has(operatorId)
      ? ('multiple' as const)
      : ('single' as const),
    loading: loadingComparatorSuggestions,
    value: comparator,
    onChange: onComparatorChange,
    notFoundContent: t('Type a value here'),
    disabled: DISABLE_INPUT_OPERATORS.includes(operatorId),
    placeholder: createSuggestionsPlaceholder(),
    autoFocus: shouldFocusComparator,
    onFocus: () => setFocusComparatorAfterChange(false),
  };

  const labelText =
    comparator && comparator.length > 0 && createSuggestionsPlaceholder();

  const isTemporalSubject =
    !!subject && isTemporalColumn(subject, props.datasource);
  const shouldShowDatePicker =
    isTemporalSubject && operatorId === Operators.TemporalRange;

  const datePicker = useDatePickerInAdhocFilter({
    columnName: props.adhocFilter.subject,
    timeRange: shouldShowDatePicker
      ? props.adhocFilter.comparator
      : undefined,
    datasource: props.datasource,
    onChange: onDatePickerChange,
  });

  useEffect(() => {
    const refreshComparatorSuggestions = () => {
      const { datasource } = props;
      const col = props.adhocFilter.subject;
      const having = props.adhocFilter.clause === Clauses.Having;

      if (col && datasource && datasource.filter_select && !having) {
        const controller = new AbortController();
        const { signal } = controller;
        if (loadingComparatorSuggestions) {
          controller.abort();
        }
        setLoadingComparatorSuggestions(true);
        SupersetClient.get({
          signal,
          endpoint: `/api/v1/datasource/${datasource.type}/${datasource.id}/column/${col}/values/`,
        })
          .then(({ json }) => {
            setSuggestions(
              json.result.map(
                (suggestion: null | number | boolean | string) => ({
                  value: suggestion,
                  label: optionLabel(suggestion),
                }),
              ),
            );
            setLoadingComparatorSuggestions(false);
          })
          .catch(() => {
            setSuggestions([]);
            setLoadingComparatorSuggestions(false);
          });
      }
    };
    if (shouldShowDatePicker) {
      setSuggestions([]);
    } else {
      refreshComparatorSuggestions();
    }
  }, [props.adhocFilter.subject, props.adhocFilter.operatorId]);

  useEffect(() => {
    if (isFeatureEnabled(FeatureFlag.EnableAdvancedDataTypes)) {
      fetchSubjectAdvancedDataType(props);
    }
  }, [props.adhocFilter.subject]);

  useEffect(() => {
    if (isFeatureEnabled(FeatureFlag.EnableAdvancedDataTypes)) {
      fetchAdvancedDataTypeValueCallback(
        comparator === undefined ? '' : comparator,
        advancedDataTypesState,
        subjectAdvancedDataType,
      );
    }
  }, [comparator, subjectAdvancedDataType, fetchAdvancedDataTypeValueCallback]);

  useEffect(() => {
    if (isFeatureEnabled(FeatureFlag.EnableAdvancedDataTypes)) {
      setComparator(props.adhocFilter.comparator);
    }
  }, [props.adhocFilter.comparator]);
  const theme = useTheme();

  // another name for columns, just for following previous naming.
  const subjectComponent = (
    <Select
      css={{
        marginTop: theme.sizeUnit * 4,
        marginBottom: theme.sizeUnit * 4,
      }}
      data-test="select-element"
      options={columns.map(column => ({
        value:
          ('column_name' in column && column.column_name) ||
          ('optionName' in column && column.optionName) ||
          '',
        filter_str: 
            ('verbose_name' in column && column.verbose_name) 
            + " " + ('column_name' in column && column.column_name),
        key:
          ('id' in column && column.id) ||
          ('optionName' in column && column.optionName) ||
          undefined,
        label: renderSubjectOptionLabel(column),
      }))}
      {...subjectSelectProps}
    />
  );

  const operatorComponent = (
    <Select
      options={(props.operators ?? OPERATORS_OPTIONS)
        .filter(op => isOperatorRelevantWrapper(op, subject))
        .map((option, index) => ({
          value: option,
          label: OPERATOR_ENUM_TO_OPERATOR_TYPE[option].display,
          key: option,
          order: index,
        }))}
      {...operatorSelectProps}
    />
  );

  const comparatorComponent =
    MULTI_OPERATORS.has(operatorId) || suggestions.length > 0 ? (
      <Tooltip
        title={
          advancedDataTypesState.errorMessage ||
          advancedDataTypesState.parsedAdvancedDataType
        }
      >
        <SelectWithLabel
          css={css`
            margin-top: ${theme.sizeUnit * 4}px;
          `}
          labelText={labelText}
          options={suggestions}
          {...comparatorSelectProps}
        />
      </Tooltip>
    ) : (
      <Tooltip
        title={
          advancedDataTypesState.errorMessage ||
          advancedDataTypesState.parsedAdvancedDataType
        }
      >
        <div
          css={css`
            margin-top: ${theme.sizeUnit * 4}px;
          `}
        />
        <Input
          data-test="adhoc-filter-simple-value"
          name="filter-value"
          ref={ref => {
            if (ref && shouldFocusComparator) {
              ref.focus();
              setFocusComparatorAfterChange(false);
            }
          }}
          onChange={onInputComparatorChange}
          value={comparator}
          placeholder={t('Filter value (case sensitive)')}
          disabled={DISABLE_INPUT_OPERATORS.includes(operatorId)}
        />
      </Tooltip>
    );

  return (
    <>
      {subjectComponent}
      {operatorComponent}
      {shouldShowDatePicker ? datePicker : comparatorComponent}
    </>
  );
};

export default AdhocFilterEditPopoverSimpleTabContent;