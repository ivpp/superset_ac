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
import { SupersetClient, t } from '@superset-ui/core';
import rison from 'rison';
import { FormValues } from './types';

export const createGroup = async (values: FormValues) => {
  await SupersetClient.post({
    endpoint: '/api/v1/security/groups/',
    jsonPayload: { ...values, users: values.users.map(user => user.value) },
  });
};

export const updateGroup = async (groupId: number, values: FormValues) => {
  await SupersetClient.put({
    endpoint: `/api/v1/security/groups/${groupId}`,
    jsonPayload: { ...values, users: values.users.map(user => user.value) },
  });
};

export const deleteGroup = async (groupId: number) =>
  SupersetClient.delete({
    endpoint: `/api/v1/security/groups/${groupId}`,
  });

type User = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

const fetchUsersByColumn = async (
  col: 'username' | 'first_name' | 'last_name' | 'email',
  value: string,
  pageSize = 100,
) => {
  const allUsers: User[] = [];
  let page = 0;
  let totalCount = 0;

  do {
    const query = rison.encode({
      filters: [
        {
          col,
          opr: 'ct', // contains
          value,
        },
      ],
      page,
      page_size: pageSize,
      order_column: 'username',
      order_direction: 'asc',
    });

    const response = await SupersetClient.get({
      endpoint: `/api/v1/security/users/?q=${query}`,
    });

    const results = response.json?.result || [];
    totalCount = response.json?.count ?? 0;

    allUsers.push(...results);
    page += 1;
  } while (allUsers.length < totalCount);

  return allUsers;
};

export const fetchUserOptions = async (
  filterValue: string,
  addDangerToast: (msg: string) => void,
) => {
  const value = filterValue.trim();

  try {
    const columns: Array<'username' | 'first_name' | 'last_name' | 'email'> =
      value ? ['username', 'first_name', 'last_name', 'email'] : ['username'];

    const results = await Promise.all(
      columns.map(col => fetchUsersByColumn(col, value)),
    );

    const usersById = new Map<number, User>();

    results.flat().forEach(user => {
      usersById.set(user.id, user);
    });

    const data = Array.from(usersById.values())
      .map(user => {
        const fullName = [user.last_name, user.first_name]
          .filter(Boolean)
          .join(' ');

        return {
          value: user.id,
          label: fullName
            ? `${fullName} (${user.username})`
            : user.username || user.email || String(user.id),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      data,
      totalCount: data.length,
    };
  } catch (error) {
    addDangerToast(t('There was an error while fetching users'));
    return { data: [], totalCount: 0 };
  }
};