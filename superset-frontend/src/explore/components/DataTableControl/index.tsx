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
import { useMemo, useState, useEffect, useRef, useCallback, RefObject } from 'react';
import {
  css,
  GenericDataType,
  getTimeFormatter,
  safeHtmlSpan,
  styled,
  t,
  TimeFormats,
  useTheme,
} from '@superset-ui/core';
import { Column } from 'react-table';
import { debounce } from 'lodash';
import {
  Constants,
  Button,
  Icons,
  Input,
  Popover,
  Radio,
  Tooltip,
} from '@superset-ui/core/components';
import { useToasts } from 'src/components/MessageToasts/withToasts';
import { getTimeColumns, setTimeColumns } from './utils';

export const CellNull = styled('span')`
  color: ${({ theme }) => theme.colorTextTertiary};
`;

export const CopyButton = styled(Button)`
  font-size: ${({ theme }) => theme.fontSizeSM}px;

  // needed to override button's first-of-type margin: 0
  && {
    margin: 0 ${({ theme }) => theme.sizeUnit * 2}px;
  }

  i {
    padding: 0 ${({ theme }) => theme.sizeUnit}px;
  }
`;


const escapeClipboardHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const prepareCopyToClipboardTsvData = (
  data: TabularDataRow[],
  columns: string[],
) =>
  [
    columns.join('\t'),
    ...data.map(row =>
      columns
        .map(column =>
          String(row[column] ?? '')
            .replace(/\r?\n/g, ' ')
            .replace(/\t/g, ' '),
        )
        .join('\t'),
    ),
  ].join('\n');

const getExcelCellStyle = (columnType?: GenericDataType) => {
  if (columnType === GenericDataType.String) {
    return ` style="mso-number-format:'\\@';"`;
  }

  return '';
};

const prepareCopyToClipboardHtmlData = (
  data: TabularDataRow[],
  columns: string[],
  columnTypes?: GenericDataType[],
) => `
<html>
<head>
  <meta charset="utf-8" />
</head>
<body>
  <table>
    <thead>
      <tr>
        ${columns
          .map(column => `<th>${escapeClipboardHtml(column)}</th>`)
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${data
        .map(
          row => `
        <tr>
          ${columns
            .map((column, index) => {
              const columnType = columnTypes?.[index];
              const value = row[column];
              return `<td${getExcelCellStyle(columnType)}>${escapeClipboardHtml(value)}</td>`;
            })
            .join('')}
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

const writeTextFallbackToClipboard = (text: string) => {
  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';

  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
};

const writeTableToClipboard = async ({
  text,
  html,
}: {
  text: string;
  html: string;
}) => {
  const clipboard = globalThis.navigator?.clipboard;

  if (
    clipboard?.write &&
    typeof globalThis.ClipboardItem !== 'undefined' &&
    typeof Blob !== 'undefined'
  ) {
    await clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
    return true;
  }

  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return true;
  }

  return writeTextFallbackToClipboard(text);
};

type TabularDataRow = Record<string, unknown>;

export const CopyToClipboardButton = ({
  data,
  columns,
  columnTypes,
  disabled = false,
}: {
  data?: TabularDataRow[];
  columns?: string[];
  columnTypes?: GenericDataType[];
  disabled?: boolean;
}) => {
  const theme = useTheme();
  const { addSuccessToast } = useToasts();

  const handleCopy = useCallback(async () => {
    if (disabled || !data || !columns) {
      return;
    }

    const text = prepareCopyToClipboardTsvData(data, columns);
    const html = prepareCopyToClipboardHtmlData(data, columns, columnTypes);
    const copied = await writeTableToClipboard({ text, html });

    if (copied) {
      addSuccessToast(t('Copied!'));
    }
  }, [addSuccessToast, columnTypes, columns, data, disabled]);

  return (
    <Tooltip title={t('Copy to clipboard')}>
      <span
        role="button"
        aria-label={t('Copy to clipboard')}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={handleCopy}
        onKeyDown={event => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            handleCopy();
          }
        }}
      >
        <Icons.CopyOutlined
          iconColor={theme.colorIcon}
          iconSize="l"
          css={css`
            opacity: ${disabled ? 0.3 : 1};
            cursor: ${disabled ? 'not-allowed' : 'pointer'};
            &.anticon > * {
              line-height: 0;
            }
          `}
        />
      </span>
    </Tooltip>
  );
};

export const FilterInput = ({
  onChangeHandler,
  shouldFocus = false,
}: {
  onChangeHandler(filterText: string): void;
  shouldFocus?: boolean;
}) => {
  const inputRef: RefObject<any> = useRef(null);

  useEffect(() => {
    // Focus the input element when the component mounts
    if (inputRef.current && shouldFocus) {
      inputRef.current.focus();
    }
  }, []);

  const theme = useTheme();
  const debouncedChangeHandler = debounce(
    onChangeHandler,
    Constants.SLOW_DEBOUNCE,
  );
  return (
    <Input
      prefix={<Icons.SearchOutlined iconSize="l" />}
      placeholder={t('Search')}
      onChange={(event: any) => {
        const filterText = event.target.value;
        debouncedChangeHandler(filterText);
      }}
      css={css`
        width: 200px;
        margin-right: ${theme.sizeUnit * 2}px;
      `}
      ref={inputRef}
    />
  );
};

enum FormatPickerValue {
  Formatted = 'formatted',
  Original = 'original',
}

const FormatPicker = ({
  onChange,
  value,
}: {
  onChange: any;
  value: FormatPickerValue;
}) => (
  <Radio.GroupWrapper
    spaceConfig={{
      direction: 'vertical',
      align: 'start',
      size: 15,
      wrap: false,
    }}
    size="large"
    value={value}
    onChange={onChange}
    options={[
      { label: t('Formatted date'), value: FormatPickerValue.Formatted },
      { label: t('Original value'), value: FormatPickerValue.Original },
    ]}
  />
);

const FormatPickerContainer = styled.div`
  display: flex;
  flex-direction: column;

  padding: ${({ theme }) => `${theme.sizeUnit * 4}px`};
`;

const FormatPickerLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorText};
  margin-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const DataTableTemporalHeaderCell = ({
  columnName,
  onTimeColumnChange,
  datasourceId,
  isOriginalTimeColumn,
}: {
  columnName: string;
  onTimeColumnChange: (
    columnName: string,
    columnType: FormatPickerValue,
  ) => void;
  datasourceId?: string;
  isOriginalTimeColumn: boolean;
}) => {
  const theme = useTheme();

  const onChange = (e: any) => {
    onTimeColumnChange(columnName, e.target.value);
  };

  const overlayContent = useMemo(
    () =>
      datasourceId ? ( // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <FormatPickerContainer
          onClick={(e: React.MouseEvent<HTMLElement>) => e.stopPropagation()}
        >
          {/* hack to disable click propagation from popover content to table header, which triggers sorting column */}
          <FormatPickerLabel>{t('Column Formatting')}</FormatPickerLabel>
          <FormatPicker
            onChange={onChange}
            value={
              isOriginalTimeColumn
                ? FormatPickerValue.Original
                : FormatPickerValue.Formatted
            }
          />
        </FormatPickerContainer>
      ) : null,
    [datasourceId, isOriginalTimeColumn],
  );

  return datasourceId ? (
    <span>
      <Popover
        trigger="click"
        content={overlayContent}
        placement="bottomLeft"
        arrow={{ pointAtCenter: true }}
      >
        <Icons.SettingOutlined
          iconSize="m"
          iconColor={theme.colorIcon}
          css={{ marginRight: `${theme.sizeUnit}px` }}
          onClick={(e: React.MouseEvent<HTMLElement>) => e.stopPropagation()}
        />
      </Popover>
      {columnName}
    </span>
  ) : (
    <span>{columnName}</span>
  );
};

export const useFilteredTableData = (
  filterText: string,
  data?: Record<string, any>[],
) => {
  const rowsAsStrings = useMemo(
    () =>
      data?.map((row: Record<string, any>) =>
        Object.values(row).map(value =>
          value ? value.toString().toLowerCase() : t('N/A'),
        ),
      ) ?? [],
    [data],
  );

  return useMemo(() => {
    if (!data?.length) {
      return [];
    }
    return data.filter((_, index: number) =>
      rowsAsStrings[index].some(value =>
        value?.includes(filterText.toLowerCase()),
      ),
    );
  }, [data, filterText, rowsAsStrings]);
};

const timeFormatter = getTimeFormatter(TimeFormats.DATABASE_DATETIME);

export const useTableColumns = (
  colnames?: string[],
  coltypes?: GenericDataType[],
  data?: Record<string, any>[],
  datasourceId?: string,
  isVisible?: boolean,
  moreConfigs?: { [key: string]: Partial<Column> },
  allowHTML?: boolean,
) => {
  const [originalFormattedTimeColumns, setOriginalFormattedTimeColumns] =
    useState<string[]>(getTimeColumns(datasourceId));

  const onTimeColumnChange = (
    columnName: string,
    columnType: FormatPickerValue,
  ) => {
    if (!datasourceId) {
      return;
    }
    if (
      columnType === FormatPickerValue.Original &&
      !originalFormattedTimeColumns.includes(columnName)
    ) {
      const cols = getTimeColumns(datasourceId);
      cols.push(columnName);
      setTimeColumns(datasourceId, cols);
      setOriginalFormattedTimeColumns(cols);
    } else if (
      columnType === FormatPickerValue.Formatted &&
      originalFormattedTimeColumns.includes(columnName)
    ) {
      const cols = getTimeColumns(datasourceId);
      cols.splice(cols.indexOf(columnName), 1);
      setTimeColumns(datasourceId, cols);
      setOriginalFormattedTimeColumns(cols);
    }
  };

  useEffect(() => {
    if (isVisible) {
      setOriginalFormattedTimeColumns(getTimeColumns(datasourceId));
    }
  }, [datasourceId, isVisible]);

  return useMemo(
    () =>
      colnames && data?.length
        ? colnames
            .filter((column: string) => Object.keys(data[0]).includes(column))
            .map((key, index) => {
              const colType = coltypes?.[index];
              const firstValue = data[0][key];
              const originalFormattedTimeColumnIndex =
                colType === GenericDataType.Temporal
                  ? originalFormattedTimeColumns.indexOf(key)
                  : -1;
              const isOriginalTimeColumn =
                originalFormattedTimeColumns.includes(key);
              return {
                // react-table requires a non-empty id, therefore we introduce a fallback value in case the key is empty
                id: key || index,
                accessor: (row: Record<string, any>) => row[key],
                Header:
                  colType === GenericDataType.Temporal &&
                  typeof firstValue !== 'string' ? (
                    <DataTableTemporalHeaderCell
                      columnName={key}
                      datasourceId={datasourceId}
                      onTimeColumnChange={onTimeColumnChange}
                      isOriginalTimeColumn={isOriginalTimeColumn}
                    />
                  ) : (
                    key
                  ),
                Cell: ({ value }) => {
                  if (value === true) {
                    return Constants.BOOL_TRUE_DISPLAY;
                  }
                  if (value === false) {
                    return Constants.BOOL_FALSE_DISPLAY;
                  }
                  if (value === null) {
                    return <CellNull>{Constants.NULL_DISPLAY}</CellNull>;
                  }
                  if (
                    colType === GenericDataType.Temporal &&
                    originalFormattedTimeColumnIndex === -1 &&
                    typeof value === 'number'
                  ) {
                    return timeFormatter(value);
                  }
                  if (typeof value === 'string' && allowHTML) {
                    return safeHtmlSpan(value);
                  }
                  return String(value);
                },
                ...moreConfigs?.[key],
              } as Column;
            })
        : [],
    [
      colnames,
      data,
      coltypes,
      datasourceId,
      moreConfigs,
      originalFormattedTimeColumns,
    ],
  );
};
