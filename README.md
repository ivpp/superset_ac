<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->
# Superset-AC

We take Superset 6.0.0 and make it awesome (for us 😊).

## Why customize?

Features:
- Fix numerous UI bugs
- Fix and extend export options: CSV and Excel export, pivoted CSV and Excel export, export all rows
- Add info sheet to Excel export with export metadat
- Add Keycloak SSO with optional username/password login
- Add `columns_are_active` macro to Jinja template processor for conditionally applying left joins in virtual datasets
- Make role, user, and group edit dialogs much more user-friendly
- Add ability to reset user passwords in admin panel
- ...etc.

## Deploy

- We clone repository, [configure](#configure) and build using [Dockerfile](https://github.com/ivpp/superset_ac/blob/master/Dockerfile).
- We deploy only Superset application itself, no other components described [here](https://superset.apache.org/admin-docs/installation/architecture).
- We use PostgreSQL as metadata database, which is deployed separately.

These are environment variables that we provide as docker run arguments when running the container:
```ini
# Built-in Superset environment variables
SUPERSET_SECRET_KEY=...
SQLALCHEMY_DATABASE_URI=postgresql://user_name:user_password@x.x.x.x/database_name
# Custom environment variables
YANDEX_MAP_API_KEY=...
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
# Docker environment variables
TZ=...
```

### How to run

1. Clone the repository
2. [Configure](#configure)
3. Build image - `cd` to the project root, then:
```bash
sudo docker build -t superset_ac:6.0.0 .
```
4. Run container:
```bash
sudo docker run \
    -d \
    -p <desired_port>:8088 \
    -e SUPERSET_SECRET_KEY=... \
    -e SQLALCHEMY_DATABASE_URI="postgresql://user_name:user_password@x.x.x.x/database_name" \
    -e YANDEX_MAP_API_KEY=... \
    -e OAUTH_CLIENT_ID=... \
    -e OAUTH_CLIENT_SECRET=... \
    -e TZ=... \
    --name superset_ac_6_0_0 \
    --restart unless-stopped \
    superset_ac:6.0.0
```

## Configure

We use `superset_config.py` as described [here](https://superset.apache.org/admin-docs/configuration/configuring-superset#superset_configpy).
We put it to the root of the project. It is copied and `SUPERSET_CONFIG_PATH` environment variable is set accordingly in `Dockerfile`.

This is our perfect superset_config.py:
```python
import os
import sys
import csv
from datetime import timedelta
from superset.config import D3Format, CORS_OPTIONS, TALISMAN_CONFIG, TALISMAN_DEV_CONFIG
from flask_appbuilder.security.manager import AUTH_OAUTH

# For Oracle support:
import oracledb
sys.modules["cx_Oracle"] = oracledb
oracledb.version = "8.3.0"

# Multiple favicons can be specified here. The "href" property
# is mandatory, but "sizes," "type," and "rel" are optional.
# For example:
# {
#     "href":path/to/image.png",
#     "sizes": "16x16",
#     "type": "image/png"
#     "rel": "icon"
# },
FAVICONS = [{"href": "/static/assets/images/favicon-name.svg"}]

# Default theme configuration
THEME_DEFAULT = {
    "token": {
        "brandLogoUrl" : "/static/assets/images/logo-name.svg",
    },  
}

# This is an important setting, and should be lower than your
# [load balancer / proxy / envoy / kong / ...] timeout settings.
# You should also make sure to configure your WSGI server
# (gunicorn, nginx, apache, ...) timeout setting to be <= to this setting
SUPERSET_WEBSERVER_TIMEOUT = int(timedelta(minutes=10).total_seconds())

# The SQLAlchemy connection string.
SQLALCHEMY_DATABASE_URI = os.environ.get("SQLALCHEMY_DATABASE_URI")

# ----------------------------------------------------
# AUTHENTICATION CONFIG
# ----------------------------------------------------
# The authentication type
# AUTH_DB : Is for database (username/password)
# AUTH_LDAP : Is for LDAP
# AUTH_REMOTE_USER : Is for using REMOTE_USER from web server
AUTH_TYPE = AUTH_OAUTH
OAUTH_PROVIDERS = [
    {
        "name": "keycloak",
        "verbose_name": ...,
        "token_key": "access_token",
        "icon": "fa-address-card",
        "remote_app": {
            "client_id": os.environ.get("OAUTH_CLIENT_ID"),
            "client_secret": os.environ.get("OAUTH_CLIENT_SECRET"),
            "server_metadata_url": ...,
            "client_kwargs": {"scope": "openid email profile "},
        }
    }
]
OAUTH_SERVER_LOGOUT_URL = ...
# Set AUTH_OAUTH_OR_AUTH_DB to True to allow login using SSO or login and password
AUTH_OAUTH_OR_AUTH_DB = True
if AUTH_OAUTH_OR_AUTH_DB:
    from superset.custom_sso_security_manager import CustomSsoDbSecurityManager
    CUSTOM_SECURITY_MANAGER = CustomSsoDbSecurityManager
else:
    from superset.custom_sso_security_manager import CustomSsoSecurityManager
    CUSTOM_SECURITY_MANAGER = CustomSsoSecurityManager

# The allowed translation for your app
LANGUAGES = {
    "en": {"flag": "us", "name": "English"},
    "ru": {"flag": "ru", "name": "Russian"},
}

# D3_FORMAT: D3Format = {}
D3_FORMAT: D3Format  = {
    "decimal": ",",           # - decimal place string (e.g., ".").
    "thousands": " ",         # - group separator string (e.g., ",").
    "grouping": [3],          # - array of group sizes (e.g., [3]), cycled as needed.
}

# Feature flags
FEATURE_FLAGS: dict[str, bool] = {
    "ENABLE_TEMPLATE_PROCESSING": True
}

# CSV Options: key/value pairs that will be passed as argument to DataFrame.to_csv
# method.
# note: index option should not be overridden
# CSV_EXPORT = {"encoding": "utf-8-sig"}
CSV_EXPORT = {
    "encoding": "utf-8-sig",
    "sep": ";",
    "decimal": ",",
    "quoting": csv.QUOTE_NONNUMERIC
}

# Excel Options: key/value pairs that will be passed as argument to DataFrame.to_excel
# method.
# note: index option should not be overridden
EXCEL_EXPORT = {"index": False}

# Maximum number of rows returned for any analytical database query
SQL_MAX_ROW = 10000000

# Override the default mapbox tiles
# Default values are equivalent to
DECKGL_BASE_MAP = [
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", "Streets (OSM)"],
    ["tile://https://tiles.api-maps.yandex.ru/v1/tiles/?projection=web_mercator"
     "&x={{x}}&y={{y}}&z={{z}}&lang=ru_RU&l=map"
     f"&apikey={os.environ.get('YANDEX_MAP_API_KEY')}", "YandexMap"],
]

# CORS Options
CORS_OPTIONS["origins"].append("https://tiles.api-maps.yandex.ru")

# If you want Talisman, how do you want it configured??
# For more information on setting up Talisman, please refer to
# https://superset.apache.org/docs/configuration/networking-settings/#changing-flask-talisman-csp
TALISMAN_CONFIG["content_security_policy"]["connect-src"].append("https://tiles.api-maps.yandex.ru")
TALISMAN_DEV_CONFIG["content_security_policy"]["connect-src"].append("https://tiles.api-maps.yandex.ru")

# Use all X-Forwarded headers when ENABLE_PROXY_FIX is True.
# When proxying to a different port, set "x_port" to 0 to avoid downstream issues.
ENABLE_PROXY_FIX = True

```

### How to add branding

Before building image:
 - Logo: put `.svg` file to `/static/assets/images/logo-name.svg` and add this to `superset_config.py`:
```python
THEME_DEFAULT = {
    "token": {
        "brandLogoUrl" : "/static/assets/images/logo-name.svg",
    },
}
```
 - Favicon: put `.svg` file to `/static/assets/images/favicon-name.svg` and add `FAVICONS = [{"href": "/static/assets/images/favicon-name.svg"}]` to `superset_config.py`
 - Loader: put `.gif` file to `superset-frontend/packages/superset-ui-core/src/components/assets/images/loading.gif` and to `superset-frontend/src/assets/images/loading.gif`

## Key feature examples

### SSO with optional normal login and password

We define two custom Superset security managers: `CustomSsoSecurityManager` for Keycloak
and `CustomSsoDbSecurityManager` for Keycloak or normal login and password. This is
how to use them in `superset_config.py`:

```python
AUTH_TYPE = AUTH_OAUTH
OAUTH_PROVIDERS = [
    {
        "name": "keycloak",
        "verbose_name": "Keycloak SSO",
        "token_key": "access_token",
        "icon": "fa-address-card",
        "remote_app": {
            "client_id": ...,
            "client_secret": ...,
            "server_metadata_url": "https://.../auth/realms/.../.well-known/openid-configuration",,
            "client_kwargs": {"scope": "openid email profile "},
        }
    }
]
OAUTH_SERVER_LOGOUT_URL = "https://.../auth/realms/.../protocol/openid-connect/logout"
AUTH_OAUTH_OR_AUTH_DB = True
if AUTH_OAUTH_OR_AUTH_DB:
    from superset.custom_sso_security_manager import CustomSsoDbSecurityManager
    CUSTOM_SECURITY_MANAGER = CustomSsoDbSecurityManager
else:
    from superset.custom_sso_security_manager import CustomSsoSecurityManager
    CUSTOM_SECURITY_MANAGER = CustomSsoSecurityManager
```
When `AUTH_TYPE = AUTH_OAUTH` AND `AUTH_OAUTH_OR_AUTH_DB = True`, Keycloak with optional normal login and password is used,
or just Keycloak otherwise. Use exactly `AUTH_OAUTH_OR_AUTH_DB` constant, as it is
referenced in frontend to render appropriate login forms.

You can set up any other SSO provider following instructions [here](https://superset.apache.org/admin-docs/configuration/configuring-superset#custom-oauth2-configuration).

### Join elimination with Jinja

Suppose your data source is like this:
```sql
select
    table1.id as id,
    table1.id222 as id222,
    table2.col2 as t2_col2,
    table3.col3 as t3_col3,
    table4.col4 as t4_col4,
    COALESCE(table2.col2, table4.col4) AS tcol5
from table1
left join table2 on table1.t2_id = table2.id
left join table3 on table2.t3_id = table3.id
left join table4 on table1.t4_id = table4.id
```
Suppose also that the joined tables are joined on their primary keys. Since these are `LEFT JOIN`s, the joins preserve the number of rows.
Clearly, not all `JOIN`s are always necessary. For example, to retrieve distinct IDs from table2, we only need one `JOIN`.
We introduce the `columns_are_active` macro in the Jinja template processor. It checks whether columns are used in the user's query in dimensions, metrics, or filters. You can now create a virtual dataset like this:
```sql
select
    {% if columns_are_active(['ID']) %}, table1.id AS id {% else %}, null as id {% endif %}
    {% if columns_are_active(['ID222']) %}, table1.id222 AS id222 {% else %}, null as id222 {% endif %}
    {% if columns_are_active(['T2_COL2']) %}, table2.col2 AS t2_col2 {% else %}, null as t2_col2 {% endif %}
    {% if columns_are_active(['T3_COL3']) %}, table3.col3 AS t3_col3 {% else %}, null as t3_col3 {% endif %}
    {% if columns_are_active(['T4_COL4']) %}, table4.col4 AS t4_col4 {% else %}, null as t4_col4 {% endif %}
    {% if columns_are_active(['TCOL5']) %}, COALESCE(table2.col2, table4.col4) AS tcol5 {% else %}, null as tcol5 {% endif %}
FROM table1
{% if columns_are_active(['T2_COL2', 'T3_COL3', 'TCOL5']) %} LEFT JOIN table2 ON table1.t2_id = table2.id {% endif %}
{% if columns_are_active(['T3_COL3']) %} LEFT JOIN table3 ON table2.t3_id = table3.id {% endif %}
{% if columns_are_active(['T4_COL4', 'TCOL5']) %} LEFT JOIN table4 ON table1.t4_id = table4.id {% endif %}
```
For the previous example, this eliminates unnecessary `JOIN`s when possible.
Some RDBMSs have built-in `JOIN` elimination, but analyzing the query takes time. In extreme cases involving hundreds of joins, it can take the optimizer several minutes to determine which joins are actually needed.

To construct the Jinja template above, you need to resolve the dependencies between the columns in the `SELECT` clause and the joined tables. We provide a script in [this repository](https://github.com/ivpp/sql_join_dependencies) that automatically converts SQL queries into the corresponding Jinja templates.

## Development

We develop in Visual Studio Code devcontainer. Do the following to setup basic dev server
with hot reloading for both backend and frontend which is publically available on LAN:
- Clone the repository
- Open it in Visual Studio Code
- Create file `.devcontainer/devcontainer.env` with required environmetal variables. It must include at list one environment variable - `SUPERSET_SECRET_KEY` for your dev Superset instance.
- Open project in devcontainer
- In a new terminal run:
```bash
superset run -p <backend_port> --reload --debug
```
- In ther second new terminal run:
```bash
cd superset-frontend
npm run dev-server -- --env=--superset=http://127.0.0.1:<backend_port> --port <frontend_port>
```

## ❗Security❗
- We provide our custom security managers. Review the corresponding code and use them at your own risk.
- We disable escaping of special characters during CSV export (CSV injection protection). We do this because we are confident in our data sources, and disabling this feature speeds up CSV export significantly.


---

---

# Superset

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/license/apache-2-0)
[![Latest Release on Github](https://img.shields.io/github/v/release/apache/superset?sort=semver)](https://github.com/apache/superset/releases/latest)
[![Build Status](https://github.com/apache/superset/actions/workflows/superset-python-unittest.yml/badge.svg)](https://github.com/apache/superset/actions)
[![PyPI version](https://badge.fury.io/py/apache_superset.svg)](https://badge.fury.io/py/apache_superset)
[![Coverage Status](https://codecov.io/github/apache/superset/coverage.svg?branch=master)](https://codecov.io/github/apache/superset)
[![PyPI](https://img.shields.io/pypi/pyversions/apache_superset.svg?maxAge=2592000)](https://pypi.python.org/pypi/apache_superset)
[![Get on Slack](https://img.shields.io/badge/slack-join-orange.svg)](http://bit.ly/join-superset-slack)
[![Documentation](https://img.shields.io/badge/docs-apache.org-blue.svg)](https://superset.apache.org)

<picture width="500">
  <source
    width="600"
    media="(prefers-color-scheme: dark)"
    src="https://superset.apache.org/img/superset-logo-horiz-dark.svg"
    alt="Superset logo (dark)"
  />
  <img
    width="600"
    src="https://superset.apache.org/img/superset-logo-horiz-apache.svg"
    alt="Superset logo (light)"
  />
</picture>

A modern, enterprise-ready business intelligence web application.

[**Why Superset?**](#why-superset) |
[**Supported Databases**](#supported-databases) |
[**Installation and Configuration**](#installation-and-configuration) |
[**Release Notes**](https://github.com/apache/superset/blob/master/RELEASING/README.md#release-notes-for-recent-releases) |
[**Get Involved**](#get-involved) |
[**Contributor Guide**](#contributor-guide) |
[**Resources**](#resources) |
[**Organizations Using Superset**](https://github.com/apache/superset/blob/master/RESOURCES/INTHEWILD.md)

## Why Superset?

Superset is a modern data exploration and data visualization platform. Superset can replace or augment proprietary business intelligence tools for many teams. Superset integrates well with a variety of data sources.

Superset provides:

- A **no-code interface** for building charts quickly
- A powerful, web-based **SQL Editor** for advanced querying
- A **lightweight semantic layer** for quickly defining custom dimensions and metrics
- Out of the box support for **nearly any SQL** database or data engine
- A wide array of **beautiful visualizations** to showcase your data, ranging from simple bar charts to geospatial visualizations
- Lightweight, configurable **caching layer** to help ease database load
- Highly extensible **security roles and authentication** options
- An **API** for programmatic customization
- A **cloud-native architecture** designed from the ground up for scale

## Screenshots & Gifs

**Video Overview**

<!-- File hosted here https://github.com/apache/superset-site/raw/lfs/superset-video-4k.mp4 -->

[superset-video-1080p.webm](https://github.com/user-attachments/assets/b37388f7-a971-409c-96a7-90c4e31322e6)

<br/>

**Large Gallery of Visualizations**

<kbd><img title="Gallery" src="https://superset.apache.org/img/screenshots/gallery.jpg"/></kbd><br/>

**Craft Beautiful, Dynamic Dashboards**

<kbd><img title="View Dashboards" src="https://superset.apache.org/img/screenshots/slack_dash.jpg"/></kbd><br/>

**No-Code Chart Builder**

<kbd><img title="Slice & dice your data" src="https://superset.apache.org/img/screenshots/explore.jpg"/></kbd><br/>

**Powerful SQL Editor**

<kbd><img title="SQL Lab" src="https://superset.apache.org/img/screenshots/sql_lab.jpg"/></kbd><br/>

## Supported Databases

Superset can query data from any SQL-speaking datastore or data engine (Presto, Trino, Athena, [and more](https://superset.apache.org/docs/configuration/databases)) that has a Python DB-API driver and a SQLAlchemy dialect.

Here are some of the major database solutions that are supported:

<p align="center">
  <img src="https://superset.apache.org/img/databases/redshift.png" alt="redshift" border="0" width="200"/>
  <img src="https://superset.apache.org/img/databases/google-biquery.png" alt="google-bigquery" border="0" width="200"/>
  <img src="https://superset.apache.org/img/databases/snowflake.png" alt="snowflake" border="0" width="200"/>
  <img src="https://superset.apache.org/img/databases/trino.png" alt="trino" border="0" width="150" />
  <img src="https://superset.apache.org/img/databases/presto.png" alt="presto" border="0" width="200"/>
  <img src="https://superset.apache.org/img/databases/databricks.png" alt="databricks" border="0" width="160" />
  <img src="https://superset.apache.org/img/databases/druid.png" alt="druid" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/firebolt.png" alt="firebolt" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/timescale.png" alt="timescale" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/postgresql.png" alt="postgresql" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/mysql.png" alt="mysql" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/mssql-server.png" alt="mssql-server" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/ibm-db2.svg" alt="db2" border="0" width="220" />
  <img src="https://superset.apache.org/img/databases/sqlite.png" alt="sqlite" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/sybase.png" alt="sybase" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/mariadb.png" alt="mariadb" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/vertica.png" alt="vertica" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/oracle.png" alt="oracle" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/firebird.png" alt="firebird" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/greenplum.png" alt="greenplum" border="0" width="200"  />
  <img src="https://superset.apache.org/img/databases/clickhouse.png" alt="clickhouse" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/exasol.png" alt="exasol" border="0" width="160" />
  <img src="https://superset.apache.org/img/databases/monet-db.png" alt="monet-db" border="0" width="200"  />
  <img src="https://superset.apache.org/img/databases/apache-kylin.png" alt="apache-kylin" border="0" width="80"/>
  <img src="https://superset.apache.org/img/databases/hologres.png" alt="hologres" border="0" width="80"/>
  <img src="https://superset.apache.org/img/databases/netezza.png" alt="netezza" border="0" width="80"/>
  <img src="https://superset.apache.org/img/databases/pinot.png" alt="pinot" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/teradata.png" alt="teradata" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/yugabyte.png" alt="yugabyte" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/databend.png" alt="databend" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/starrocks.png" alt="starrocks" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/doris.png" alt="doris" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/oceanbase.svg" alt="oceanbase" border="0" width="220" />
  <img src="https://superset.apache.org/img/databases/sap-hana.png" alt="sap-hana" border="0" width="220" />
  <img src="https://superset.apache.org/img/databases/denodo.png" alt="denodo" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/ydb.svg" alt="ydb" border="0" width="200" />
  <img src="https://superset.apache.org/img/databases/tdengine.png" alt="TDengine" border="0" width="200" />
</p>

**A more comprehensive list of supported databases** along with the configuration instructions can be found [here](https://superset.apache.org/docs/configuration/databases).

Want to add support for your datastore or data engine? Read more [here](https://superset.apache.org/docs/frequently-asked-questions#does-superset-work-with-insert-database-engine-here) about the technical requirements.

## Installation and Configuration

Try out Superset's [quickstart](https://superset.apache.org/docs/quickstart/) guide or learn about [the options for production deployments](https://superset.apache.org/docs/installation/architecture/).

## Get Involved

- Ask and answer questions on [StackOverflow](https://stackoverflow.com/questions/tagged/apache-superset) using the **apache-superset** tag
- [Join our community's Slack](http://bit.ly/join-superset-slack)
  and please read our [Slack Community Guidelines](https://github.com/apache/superset/blob/master/CODE_OF_CONDUCT.md#slack-community-guidelines)
- [Join our dev@superset.apache.org Mailing list](https://lists.apache.org/list.html?dev@superset.apache.org). To join, simply send an email to [dev-subscribe@superset.apache.org](mailto:dev-subscribe@superset.apache.org)
- If you want to help troubleshoot GitHub Issues involving the numerous database drivers that Superset supports, please consider adding your name and the databases you have access to on the [Superset Database Familiarity Rolodex](https://docs.google.com/spreadsheets/d/1U1qxiLvOX0kBTUGME1AHHi6Ywel6ECF8xk_Qy-V9R8c/edit#gid=0)
- Join Superset's Town Hall and [Operational Model](https://preset.io/blog/the-superset-operational-model-wants-you/) recurring meetings. Meeting info is available on the [Superset Community Calendar](https://superset.apache.org/community)

## Contributor Guide

Interested in contributing? Check out our
[CONTRIBUTING.md](https://github.com/apache/superset/blob/master/CONTRIBUTING.md)
to find resources around contributing along with a detailed guide on
how to set up a development environment.

## Resources

- [Superset "In the Wild"](https://github.com/apache/superset/blob/master/RESOURCES/INTHEWILD.md) - open a PR to add your org to the list!
- [Feature Flags](https://github.com/apache/superset/blob/master/RESOURCES/FEATURE_FLAGS.md) - the status of Superset's Feature Flags.
- [Standard Roles](https://github.com/apache/superset/blob/master/RESOURCES/STANDARD_ROLES.md) - How RBAC permissions map to roles.
- [Superset Wiki](https://github.com/apache/superset/wiki) - Tons of additional community resources: best practices, community content and other information.
- [Superset SIPs](https://github.com/orgs/apache/projects/170) - The status of Superset's SIPs (Superset Improvement Proposals) for both consensus and implementation status.

Understanding the Superset Points of View

- [The Case for Dataset-Centric Visualization](https://preset.io/blog/dataset-centric-visualization/)
- [Understanding the Superset Semantic Layer](https://preset.io/blog/understanding-superset-semantic-layer/)

- Getting Started with Superset
  - [Superset in 2 Minutes using Docker Compose](https://superset.apache.org/docs/installation/docker-compose#installing-superset-locally-using-docker-compose)
  - [Installing Database Drivers](https://superset.apache.org/docs/configuration/databases#installing-database-drivers)
  - [Building New Database Connectors](https://preset.io/blog/building-database-connector/)
  - [Create Your First Dashboard](https://superset.apache.org/docs/using-superset/creating-your-first-dashboard/)
  - [Comprehensive Tutorial for Contributing Code to Apache Superset
    ](https://preset.io/blog/tutorial-contributing-code-to-apache-superset/)
- [Resources to master Superset by Preset](https://preset.io/resources/)

- Deploying Superset

  - [Official Docker image](https://hub.docker.com/r/apache/superset)
  - [Helm Chart](https://github.com/apache/superset/tree/master/helm/superset)

- Recordings of Past [Superset Community Events](https://preset.io/events)

  - [Mixed Time Series Charts](https://preset.io/events/mixed-time-series-visualization-in-superset-workshop/)
  - [How the Bing Team Customized Superset for the Internal Self-Serve Data & Analytics Platform](https://preset.io/events/how-the-bing-team-heavily-customized-superset-for-their-internal-data/)
  - [Live Demo: Visualizing MongoDB and Pinot Data using Trino](https://preset.io/events/2021-04-13-visualizing-mongodb-and-pinot-data-using-trino/)
  - [Introduction to the Superset API](https://preset.io/events/introduction-to-the-superset-api/)
  - [Building a Database Connector for Superset](https://preset.io/events/2021-02-16-building-a-database-connector-for-superset/)

- Visualizations

  - [Creating Viz Plugins](https://superset.apache.org/docs/contributing/creating-viz-plugins/)
  - [Managing and Deploying Custom Viz Plugins](https://medium.com/nmc-techblog/apache-superset-manage-custom-viz-plugins-in-production-9fde1a708e55)
  - [Why Apache Superset is Betting on Apache ECharts](https://preset.io/blog/2021-4-1-why-echarts/)

- [Superset API](https://superset.apache.org/docs/rest-api)

## Repo Activity

<a href="https://next.ossinsight.io/widgets/official/compose-last-28-days-stats?repo_id=39464018" target="_blank" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-last-28-days-stats/thumbnail.png?repo_id=39464018&image_size=auto&color_scheme=dark" width="655" height="auto" />
    <img alt="Performance Stats of apache/superset - Last 28 days" src="https://next.ossinsight.io/widgets/official/compose-last-28-days-stats/thumbnail.png?repo_id=39464018&image_size=auto&color_scheme=light" width="655" height="auto" />
  </picture>
</a>

<!-- Made with [OSS Insight](https://ossinsight.io/) -->

<!-- telemetry/analytics pixel: -->
<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=bc1c90cd-bc04-4e11-8c7b-289fb2839492" />
